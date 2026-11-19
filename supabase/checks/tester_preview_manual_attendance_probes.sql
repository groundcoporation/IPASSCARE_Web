-- Embedded inside the guarded rollback-only write experiment.
-- New synthetic children isolate today's checks from existing attendance.
create temporary table tester_manual_context as
select own_branch,other_branch,
  (select parent_id from public.children where id=own_child) own_parent,other_parent,
  (now() at time zone 'Asia/Seoul')::date today,
  gen_random_uuid() own_child,gen_random_uuid() other_child,
  gen_random_uuid() own_product,gen_random_uuid() other_product,
  gen_random_uuid() own_option,gen_random_uuid() other_option,
  gen_random_uuid() own_pass,gen_random_uuid() other_pass,
  gen_random_uuid() own_reservation,gen_random_uuid() other_reservation
from tester_probe_context;
grant select on tester_manual_context to authenticated,anon;
insert into public.children(id,parent_id,child_name,child_birth,branch_id)
select own_child,own_parent,'tester-manual-audit-own','20180101',own_branch from tester_manual_context
union all select other_child,other_parent,'tester-manual-audit-other','20180101',other_branch from tester_manual_context;
insert into public.packages(id,branch_id,name,voucher_type,is_active)
select own_product,own_branch,'tester-manual-audit-own','lesson',true from tester_manual_context
union all select other_product,other_branch,'tester-manual-audit-other','lesson',true from tester_manual_context;
insert into public.package_options(id,package_id,label,price,total_count,branch_id)
select own_option,own_product,'tester-manual-audit',100,3,own_branch from tester_manual_context
union all select other_option,other_product,'tester-manual-audit',100,3,other_branch from tester_manual_context;
insert into public.user_packages(id,user_id,option_id,package_id,child_id,branch_id,beneficiary_type,
  remaining_count,total_count,status,voucher_type,expiry_date,valid_from,valid_until)
select own_pass,own_parent,own_option,own_product,own_child,own_branch,'child',3,3,'active','lesson',
  now()+interval '30 days',today-30,today+30 from tester_manual_context
union all select other_pass,other_parent,other_option,other_product,other_child,other_branch,'child',3,3,'active','lesson',
  now()+interval '30 days',today-30,today+30 from tester_manual_context;
insert into public.reservations(id,user_id,child_id,branch_id,package_id,class_date,reservation_type,status,attendance_status)
select own_reservation,own_parent,own_child,own_branch,own_pass,today,'regular','confirmed','yet' from tester_manual_context
union all select other_reservation,other_parent,other_child,other_branch,other_pass,today,'regular','confirmed','yet' from tester_manual_context;

create function pg_temp.tester_expect_error(label text, statement text, expected_code text)
returns void language plpgsql security invoker as $$
declare ok boolean:=false; state text;
begin
  begin
    execute statement;
    raise exception using errcode='PZ001',message='TESTER_PROBE_ROLLBACK';
  exception
    when sqlstate 'PZ001' then null;
    when others then state:=sqlstate; ok:=sqlstate='P0001' and sqlerrm='['||expected_code||']';
  end;
  insert into tester_write_results values(label,ok,state);
end $$;
set local role authenticated;
select pg_temp.tester_probe('manual_register_duplicate_and_cancel', $probe$
  do $flow$
  declare registered jsonb; repeated jsonb; cancelled jsonb; usage_id uuid; consumed_time timestamptz;
  begin
    registered:=public.register_manual_ledger_attendance(
      (select own_child from tester_manual_context),(select today from tester_manual_context),(select own_pass from tester_manual_context));
    repeated:=public.register_manual_ledger_attendance(
      (select own_child from tester_manual_context),(select today from tester_manual_context),(select own_pass from tester_manual_context));
    if registered->>'status' is distinct from 'registered'
      or repeated->>'status' is distinct from 'already_registered'
      or (select remaining_count from public.user_packages where id=(select own_pass from tester_manual_context)) is distinct from 2
      or (select count(*) from public.package_usage_logs where reservation_id=(select own_reservation from tester_manual_context) and status='consumed')<>1
      or (select count(*) from public.attendance_logs where child_id=(select own_child from tester_manual_context)
        and date=(select today from tester_manual_context) and check_in is not null)<>1
    then raise exception 'TESTER_MANUAL_REGISTER_OR_DUPLICATE_FAILED'; end if;
    select id,consumed_at into strict usage_id,consumed_time from public.package_usage_logs
      where reservation_id=(select own_reservation from tester_manual_context) and status='consumed';
    cancelled:=public.cancel_attendance_ledger_entry(
      (select own_child from tester_manual_context),(select today from tester_manual_context),
      (select own_pass from tester_manual_context),usage_id,consumed_time);
    if cancelled->>'cancelled' is distinct from 'true' or (cancelled->>'restored')::integer is distinct from 1
      or (select remaining_count from public.user_packages where id=(select own_pass from tester_manual_context)) is distinct from 3
      or exists(select 1 from public.attendance_logs where child_id=(select own_child from tester_manual_context) and check_in is not null)
      or exists(select 1 from public.package_usage_logs where reservation_id=(select own_reservation from tester_manual_context) and status='consumed')
    then raise exception 'TESTER_MANUAL_CANCEL_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_expect_error('manual_other_branch_denied',
  'select public.register_manual_ledger_attendance(other_child,today,other_pass) from tester_manual_context','PERMISSION_DENIED');
select pg_temp.tester_expect_error('manual_future_date_denied',
  'select public.register_manual_ledger_attendance(own_child,today+1,own_pass) from tester_manual_context','INPUT_INVALID');
select pg_temp.tester_expect_error('manual_other_pass_denied',
  'select public.register_manual_ledger_attendance(own_child,today,other_pass) from tester_manual_context','DATA_REFERENCE_ERROR');
select pg_temp.tester_expect_error('manual_missing_reservation_denied',
  'select public.register_manual_ledger_attendance(own_child,today-1,own_pass) from tester_manual_context','ATT_RESERVATION_INVALID');
reset role;
set local role anon;
select pg_temp.tester_probe('manual_anonymous_execute_denied',
  'select public.register_manual_ledger_attendance(own_child,today,own_pass) from tester_manual_context',0,true);
reset role;
