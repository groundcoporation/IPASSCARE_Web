-- Tail for the rollback-only core policy experiment, not a standalone migration.
create temporary table tester_probe_context as
select u.id actor, u.branch_id own_branch, left(u.branch_id,-1)||'2' other_branch,
  (select id from public.children where branch_id=u.branch_id order by id limit 1) own_child,
  (select id from public.children where branch_id=left(u.branch_id,-1)||'2' order by id limit 1) other_child,
  (select parent_id from public.children where branch_id=left(u.branch_id,-1)||'2' order by id limit 1) other_parent,
  gen_random_uuid() own_student,gen_random_uuid() other_student,
  gen_random_uuid() own_bill,gen_random_uuid() other_bill
from public.users u where u.role='director' and u.status='active'
  and u.email ~ '^ipass-dev-[a-f0-9]{10}-director-a@example\.com$'
  and u.branch_id ~ '^devsmoke-[a-f0-9]{10}-1$'
order by u.branch_id limit 1;
do $$ begin
  if (select count(*) from tester_probe_context)<>1
    or exists(select 1 from tester_probe_context where own_child is null or other_child is null or other_parent is null)
    or exists(select 1 from public.attendance_logs where id in (-9000000000000,-9000000000001))
  then raise exception 'TESTER_WRITE_FIXTURES_INVALID'; end if;
end $$;
insert into public.academy_students(id,branch_id,student_name,attendance_code,child_id,parent_user_id,is_sms_enabled)
select own_student,own_branch,'tester-write-audit-own','TESTER_AUDIT',own_child,
  (select parent_id from public.children where id=own_child),false from tester_probe_context
union all select other_student,other_branch,'tester-write-audit-other','TESTER_AUDIT',other_child,
  (select parent_id from public.children where id=other_child),false from tester_probe_context;
insert into public.academy_bills(id,branch_id,student_id,bill_month,amount_due,original_amount,memo)
select own_bill,own_branch,own_student,'2099-01',100,100,'tester-write-audit' from tester_probe_context
union all select other_bill,other_branch,other_student,'2099-01',100,100,'tester-write-audit' from tester_probe_context;
create temporary table tester_write_results(label text primary key,passed boolean,sqlstate text);
grant select on tester_probe_context to authenticated,anon;
grant insert,select on tester_write_results to authenticated,anon;

-- Every individual probe is also rolled back, including successful INSERTs.
create function pg_temp.tester_probe(label text, statement text, expected_rows integer, denied boolean default false)
returns void language plpgsql security invoker as $$
declare affected integer; ok boolean:=false; state text;
begin
  begin
    execute statement;
    get diagnostics affected=row_count;
    -- RLS may deny UPDATE/DELETE by hiding the row rather than raising 42501.
    ok:=affected=expected_rows and (not denied or affected=0);
    raise exception using errcode='PZ001',message='TESTER_PROBE_ROLLBACK';
  exception
    when sqlstate 'PZ001' then null;
    when insufficient_privilege then state:=sqlstate; ok:=denied;
    when raise_exception then
      state:=sqlstate;
      ok:=denied and (sqlerrm like '%권한%' or sqlerrm like '%[PERMISSION_DENIED]%');
    when others then state:=sqlstate; ok:=false;
  end;
  insert into tester_write_results values(label,ok,state);
end $$;

select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true)
from tester_probe_context;
set local role authenticated;
select pg_temp.tester_probe('own_attendance_insert',
  'insert into public.attendance_logs(id,child_id,branch_id,date,status,method) select -9000000000000,own_child,own_branch,date ''2099-01-01'',''등원'',''웹'' from tester_probe_context',1);
select pg_temp.tester_probe('own_attendance_update',
  'update public.attendance_logs set note=''tester-write-audit'' where id=(select min(id) from public.attendance_logs where branch_id=(select own_branch from tester_probe_context))',1);
select pg_temp.tester_probe('other_attendance_update_denied',
  'update public.attendance_logs set note=''tester-write-audit'' where branch_id=(select other_branch from tester_probe_context)',0);
select pg_temp.tester_probe('other_attendance_insert_denied',
  'insert into public.attendance_logs(id,child_id,branch_id,date) select -9000000000001,other_child,other_branch,date ''2099-01-01'' from tester_probe_context',0,true);
select pg_temp.tester_probe('forged_child_attendance_denied',
  'insert into public.attendance_logs(id,child_id,branch_id,date) select -9000000000001,other_child,own_branch,date ''2099-01-01'' from tester_probe_context',0,true);
select pg_temp.tester_probe('own_student_insert',
  'insert into public.academy_students(branch_id,student_name,attendance_code,is_sms_enabled) select own_branch,''tester-write-audit-new'',''TESTER_AUDIT'',false from tester_probe_context',1);
select pg_temp.tester_probe('own_student_update',
  'update public.academy_students set memo=''tester-write-audit'' where id=(select own_student from tester_probe_context)',1);
select pg_temp.tester_probe('other_student_update_denied',
  'update public.academy_students set memo=''tester-write-audit'' where id=(select other_student from tester_probe_context)',0);
select pg_temp.tester_probe('forged_child_student_denied',
  'insert into public.academy_students(branch_id,child_id,student_name,attendance_code,is_sms_enabled) select own_branch,other_child,''tester-write-audit-forged'',''TESTER_AUDIT'',false from tester_probe_context',0,true);
select pg_temp.tester_probe('own_bill_insert',
  'insert into public.academy_bills(branch_id,student_id,bill_month,amount_due,original_amount) select own_branch,own_student,''2099-02'',100,100 from tester_probe_context',1);
select pg_temp.tester_probe('own_bill_update',
  'update public.academy_bills set memo=''tester-write-audit-edited'' where id=(select own_bill from tester_probe_context)',1);
select pg_temp.tester_probe('other_bill_update_denied',
  'update public.academy_bills set memo=''tester-write-audit-edited'' where id=(select other_bill from tester_probe_context)',0);
select pg_temp.tester_probe('other_bill_delete_denied',
  'delete from public.academy_bills where id=(select other_bill from tester_probe_context)',0);
select pg_temp.tester_probe('forged_student_bill_denied',
  'insert into public.academy_bills(branch_id,student_id,bill_month,amount_due,original_amount) select own_branch,other_student,''2099-02'',100,100 from tester_probe_context',0,true);
select pg_temp.tester_probe('own_bill_move_to_other_branch_denied',
  'update public.academy_bills set branch_id=(select other_branch from tester_probe_context) where id=(select own_bill from tester_probe_context)',0,true);
select pg_temp.tester_probe('own_offline_payment_partial_and_duplicate', $probe$
  do $flow$
  declare scheduled jsonb; confirmed jsonb; repeated jsonb; payment uuid;
  begin
    scheduled:=public.schedule_offline_payment((select own_bill from tester_probe_context),40,'CASH',now(),'tester-write-audit');
    payment:=(scheduled->>'payment_id')::uuid;
    if payment is null or scheduled->>'success' is distinct from 'true'
      then raise exception 'TESTER_SCHEDULE_FAILED'; end if;
    confirmed:=public.confirm_offline_payment(payment,'tester-write-audit');
    repeated:=public.confirm_offline_payment(payment,'tester-write-audit');
    if confirmed->>'success' is distinct from 'true'
      or confirmed->>'bill_status' is distinct from 'partial'
      or repeated->>'already_paid' is distinct from 'true'
      or (select count(*) from public.payments where id=payment and status='paid' and final_amount=40)<>1
      or not exists(select 1 from public.academy_bills where id=(select own_bill from tester_probe_context)
        and amount_paid=40 and status='partial')
    then raise exception 'TESTER_CONFIRM_OR_DUPLICATE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('other_offline_schedule_denied',
  'select public.schedule_offline_payment((select other_bill from tester_probe_context),40,''CASH'',now(),''tester-write-audit'')',0,true);
reset role;
-- An existing fake scheduled receipt tests the definer RPC's branch check, not RLS alone.
alter table tester_probe_context add column other_payment uuid default gen_random_uuid();
insert into public.payments(id,user_id,branch_id,total_amount,final_amount,payment_method,status,source,academy_bill_id)
select other_payment,(select parent_id from public.children where id=other_child),other_branch,40,40,'CASH','scheduled','onsite',other_bill
from tester_probe_context;
set local role authenticated;
select pg_temp.tester_probe('other_offline_confirm_denied',
  'select public.confirm_offline_payment((select other_payment from tester_probe_context),''tester-write-audit'')',0,true);
-- Testers must not be able to turn their editable profile into an administrator.
select pg_temp.tester_probe('tester_self_role_escalation_denied',
  'update public.users set role=''admin'' where id=(select actor from tester_probe_context)',0,true);
select pg_temp.tester_probe('tester_self_branch_change_denied',
  'update public.users set branch_id=(select other_branch from tester_probe_context) where id=(select actor from tester_probe_context)',0,true);
select pg_temp.tester_probe('tester_self_points_change_denied',
  'update public.users set points=123456789 where id=(select actor from tester_probe_context)',0,true);
select pg_temp.tester_probe('tester_other_profile_change_denied',
  'update public.users set name=''tester-write-audit'' where id=(select other_parent from tester_probe_context)',0,true);
select pg_temp.tester_probe('tester_self_name_edit_allowed',
  'update public.users set name=''tester-write-audit'' where id=(select actor from tester_probe_context)',1);
reset role;
set local role anon;
select pg_temp.tester_probe('anonymous_attendance_insert_denied',
  'insert into public.attendance_logs(id,child_id,branch_id,date) select -9000000000001,own_child,own_branch,date ''2099-01-01'' from tester_probe_context',0,true);
reset role;

-- TESTER_MANUAL_PROBES

select json_build_object(
  'core_read_scope_passed',true,
  'direct_write_checks',(select count(*) from tester_write_results),
  'direct_write_passed',(select bool_and(passed) from tester_write_results),
  'failed_checks',(select coalesce(json_agg(json_build_object('label',label,'sqlstate',sqlstate)),'[]') from tester_write_results where not passed),
  'required_rpc_missing',(select coalesce(json_agg(name),'[]') from (
    values ('register_manual_ledger_attendance(uuid,date,uuid)'),
      ('cancel_attendance_ledger_entry(uuid,date,uuid,uuid,timestamp with time zone)'),
      ('schedule_offline_payment(uuid,integer,text,timestamp with time zone,text)'),
      ('confirm_offline_payment(uuid,text)')
  ) required(name) where to_regprocedure('public.'||name) is null),
  'permanent_changes',false,'release_approved',false,
  'sequence_counters_may_advance',true
) as tester_core_report;
rollback;
