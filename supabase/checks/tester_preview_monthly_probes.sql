-- Monthly schedule/billing checks, embedded in the guarded rollback transaction.
create temporary table tester_monthly_context as
select m.own_branch,m.other_branch,m.own_parent,m.other_parent,m.own_class,m.other_class,m.today,
  date_trunc('month',m.today)::date current_month,
  (date_trunc('month',m.today)+interval '1 month')::date next_month,
  gen_random_uuid() own_student,gen_random_uuid() other_student,
  gen_random_uuid() own_child,gen_random_uuid() other_child,
  gen_random_uuid() own_product,gen_random_uuid() other_product,
  gen_random_uuid() own_option,gen_random_uuid() other_option,
  gen_random_uuid() own_plan,gen_random_uuid() other_plan
from tester_menu_context m;
grant select on tester_monthly_context to authenticated,anon;
insert into public.children(id,parent_id,child_name,child_birth,branch_id)
select own_child,own_parent,'synthetic-monthly-own','20180101',own_branch from tester_monthly_context
union all select other_child,other_parent,'synthetic-monthly-other','20180101',other_branch from tester_monthly_context;
insert into public.academy_students(id,branch_id,student_name,attendance_code,child_id,parent_user_id,is_sms_enabled)
select own_student,own_branch,'synthetic-monthly-own','SYNTHETIC_MONTHLY',own_child,own_parent,false from tester_monthly_context
union all select other_student,other_branch,'synthetic-monthly-other','SYNTHETIC_MONTHLY',other_child,other_parent,false from tester_monthly_context;
insert into public.packages(id,branch_id,name,voucher_type,is_active)
select own_product,own_branch,'synthetic-monthly-own','lesson',true from tester_monthly_context
union all select other_product,other_branch,'synthetic-monthly-other','lesson',true from tester_monthly_context;
insert into public.package_options(id,package_id,branch_id,label,price,total_count)
select own_option,own_product,own_branch,'synthetic',100,3 from tester_monthly_context
union all select other_option,other_product,other_branch,'synthetic',100,3 from tester_monthly_context;
insert into public.academy_student_monthly_plans(id,student_id,branch_id,effective_month,item_type,package_option_id)
select own_plan,own_student,own_branch,date '2099-01-01','package',own_option from tester_monthly_context
union all select other_plan,other_student,other_branch,date '2099-01-01','package',other_option from tester_monthly_context;
insert into public.academy_student_billing_plan_revisions(student_id,branch_id,effective_month)
select own_student,own_branch,date '2099-01-01' from tester_monthly_context
union all select other_student,other_branch,date '2099-01-01' from tester_monthly_context
on conflict(student_id,effective_month) do nothing;

-- Run each success twice in one subtransaction and verify stored state, not just an HTTP row.
create function pg_temp.tester_monthly_success(label text,statement text)
returns void language plpgsql security invoker as $success$
declare ok boolean:=false; state text; result jsonb; c record;
begin
  begin
    select * into strict c from tester_monthly_context;
    for i in 1..2 loop
      execute statement into result;
      if result->>'success' is distinct from 'true' then raise exception 'TESTER_MONTHLY_RESULT_INVALID'; end if;
    end loop;
    if label in ('monthly_own_repeat_all_months','monthly_own_repeat_all_months_legacy',
        'monthly_own_repeat_current_schedule_billing','monthly_own_repeat_current_next_schedule','monthly_own_repeat_current_schedule')
      and (select count(*) from public.academy_student_monthly_plans where student_id=c.own_student
        and effective_month=c.current_month and class_schedule_id=c.own_class and status='planned')<>1
    then raise exception 'TESTER_MONTHLY_CURRENT_CLASS_MISSING'; end if;
    if label in ('monthly_own_repeat_all_months','monthly_own_repeat_all_months_legacy',
        'monthly_own_repeat_current_schedule_billing','monthly_own_repeat_current_billing')
      and (select count(*) from public.academy_student_monthly_plans where student_id=c.own_student
        and effective_month=c.current_month and package_option_id=c.own_option and status='planned')<>1
    then raise exception 'TESTER_MONTHLY_CURRENT_BILLING_MISSING'; end if;
    if label in ('monthly_own_repeat_all_months','monthly_own_repeat_all_months_legacy','monthly_own_repeat_all_months_locked',
        'monthly_own_repeat_future_schedule_billing','monthly_own_repeat_current_next_schedule','monthly_own_repeat_future_schedule') then
      if (select count(*) from public.academy_student_monthly_plans where student_id=c.own_student
          and effective_month=c.next_month and class_schedule_id=c.own_class and status='planned')<>1
        or (select count(*) from public.reservations where child_id=c.own_child and schedule_id=c.own_class
          and class_date>=c.next_month and class_date<c.next_month+interval '1 month')
          <> (select count(*) from generate_series(c.next_month,c.next_month+interval '1 month - 1 day',interval '1 day') d
            where extract(isodow from d)=1)
      then raise exception 'TESTER_MONTHLY_FUTURE_SCHEDULE_MISSING'; end if;
    end if;
    if label in ('monthly_own_repeat_all_months','monthly_own_repeat_all_months_legacy','monthly_own_repeat_all_months_locked',
        'monthly_own_repeat_future_schedule_billing','monthly_own_repeat_future_billing')
      and (select count(*) from public.academy_student_monthly_plans where student_id=c.own_student
        and effective_month=c.next_month and package_option_id=c.own_option and status='planned')<>1
    then raise exception 'TESTER_MONTHLY_FUTURE_BILLING_MISSING'; end if;
    if exists(select 1 from public.academy_student_monthly_plans where student_id=c.own_student
      group by effective_month,item_type,class_schedule_id,package_option_id,billing_source having count(*)>1)
      or exists(select 1 from public.reservations where child_id=c.own_child and class_date>=c.today
        group by class_date,schedule_id having count(*)>1)
      or exists(select 1 from public.student_schedule_assignments where child_id=c.own_child
        and schedule_id=c.own_class and is_active and starts_on<=c.next_month and (ends_on is null or ends_on>=c.next_month)
        group by schedule_id having count(*)>1)
    then raise exception 'TESTER_MONTHLY_DUPLICATION'; end if;
    ok:=true;
    raise exception using errcode='PZ001',message='TESTER_PROBE_ROLLBACK';
  exception when sqlstate 'PZ001' then null;
    when others then state:=sqlstate; ok:=false;
  end;
  insert into tester_write_results values(label,ok,state);
end $success$;
create temporary table tester_monthly_requests(label text,own_statement text,other_statement text);
insert into tester_monthly_requests values
  ('all_months','select public.save_student_schedule_and_billing_all_months(own_student,array[own_class],array[own_option],false,next_month,array[own_class],array[own_option],true) from tester_monthly_context','select public.save_student_schedule_and_billing_all_months(other_student,array[other_class],array[other_option],false,next_month,array[other_class],array[other_option],true) from tester_monthly_context'),
  ('all_months_locked','select public.save_student_schedule_and_billing_all_months(own_student,array[own_class],array[own_option],false,next_month,array[own_class],array[own_option],false) from tester_monthly_context','select public.save_student_schedule_and_billing_all_months(other_student,array[other_class],array[other_option],false,next_month,array[other_class],array[other_option],false) from tester_monthly_context'),
  ('all_months_legacy','select public.save_student_schedule_and_billing_all_months(own_student,array[own_class],array[own_option],false,next_month,array[own_class],array[own_option]) from tester_monthly_context','select public.save_student_schedule_and_billing_all_months(other_student,array[other_class],array[other_option],false,next_month,array[other_class],array[other_option]) from tester_monthly_context'),
  ('current_schedule_billing','select public.save_current_month_student_schedule_and_billing(own_student,array[own_class],false,array[own_option]) from tester_monthly_context','select public.save_current_month_student_schedule_and_billing(other_student,array[other_class],false,array[other_option]) from tester_monthly_context'),
  ('future_schedule_billing','select public.save_future_month_student_schedule_and_billing(own_student,next_month,array[own_class],array[own_option]) from tester_monthly_context','select public.save_future_month_student_schedule_and_billing(other_student,next_month,array[other_class],array[other_option]) from tester_monthly_context'),
  ('current_next_schedule','select public.sync_current_and_next_month_student_schedules(own_student,array[own_class],true) from tester_monthly_context','select public.sync_current_and_next_month_student_schedules(other_student,array[other_class],true) from tester_monthly_context'),
  ('current_schedule','select public.sync_current_month_student_schedules(own_student,array[own_class]) from tester_monthly_context','select public.sync_current_month_student_schedules(other_student,array[other_class]) from tester_monthly_context'),
  ('future_schedule','select public.sync_future_month_student_schedules(own_student,next_month,array[own_class]) from tester_monthly_context','select public.sync_future_month_student_schedules(other_student,next_month,array[other_class]) from tester_monthly_context'),
  ('current_billing','select public.save_current_month_student_billing_draft(own_student,array[own_option]) from tester_monthly_context','select public.save_current_month_student_billing_draft(other_student,array[other_option]) from tester_monthly_context'),
  ('future_billing','select public.save_student_monthly_package_plan(own_student,next_month,array[own_option]) from tester_monthly_context','select public.save_student_monthly_package_plan(other_student,next_month,array[other_option]) from tester_monthly_context'),
  ('reconcile','select public.reconcile_current_month_active_package_plans(own_student,array[own_option]) from tester_monthly_context','select public.reconcile_current_month_active_package_plans(other_student,array[other_option]) from tester_monthly_context'),
  ('child_schedule','select public.sync_current_month_child_schedule(own_parent,own_child,array[own_class]) from tester_monthly_context','select public.sync_current_month_child_schedule(other_parent,other_child,array[other_class]) from tester_monthly_context');
grant select on tester_monthly_requests to authenticated,anon;
set local role authenticated;
select pg_temp.tester_monthly_success('monthly_own_repeat_'||label,own_statement) from tester_monthly_requests where label<>'reconcile';
-- Internal helper remains server-only: do not widen its EXECUTE grant for a test.
select pg_temp.tester_probe('monthly_internal_reconcile_direct_denied',own_statement,0,true) from tester_monthly_requests where label='reconcile';
select pg_temp.tester_probe('monthly_other_rpc_'||label,other_statement,0,true) from tester_monthly_requests;
select pg_temp.tester_probe('monthly_foreign_class_all_months','select public.save_student_schedule_and_billing_all_months(own_student,array[other_class],array[own_option],false,next_month,array[other_class],array[own_option],true) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_option_all_months','select public.save_student_schedule_and_billing_all_months(own_student,array[own_class],array[other_option],false,next_month,array[own_class],array[other_option],true) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_class_all_months_legacy','select public.save_student_schedule_and_billing_all_months(own_student,array[other_class],array[own_option],false,next_month,array[other_class],array[own_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_option_all_months_legacy','select public.save_student_schedule_and_billing_all_months(own_student,array[own_class],array[other_option],false,next_month,array[own_class],array[other_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_class_current_schedule_billing','select public.save_current_month_student_schedule_and_billing(own_student,array[other_class],false,array[own_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_option_current_schedule_billing','select public.save_current_month_student_schedule_and_billing(own_student,array[own_class],false,array[other_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_class_future_schedule_billing','select public.save_future_month_student_schedule_and_billing(own_student,next_month,array[other_class],array[own_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_option_future_schedule_billing','select public.save_future_month_student_schedule_and_billing(own_student,next_month,array[own_class],array[other_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_class_current_next_schedule','select public.sync_current_and_next_month_student_schedules(own_student,array[other_class],true) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_class_current_schedule','select public.sync_current_month_student_schedules(own_student,array[other_class]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_class_future_schedule','select public.sync_future_month_student_schedules(own_student,next_month,array[other_class]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_option_current_billing','select public.save_current_month_student_billing_draft(own_student,array[other_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_option_future_billing','select public.save_student_monthly_package_plan(own_student,next_month,array[other_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_option_reconcile','select public.reconcile_current_month_active_package_plans(own_student,array[other_option]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_foreign_class_child_schedule','select public.sync_current_month_child_schedule(own_parent,own_child,array[other_class]) from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_forged_student_plan','insert into public.academy_student_monthly_plans(student_id,branch_id,effective_month,item_type,package_option_id) select other_student,own_branch,next_month,''package'',own_option from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_forged_option_plan','insert into public.academy_student_monthly_plans(student_id,branch_id,effective_month,item_type,package_option_id) select own_student,own_branch,next_month,''package'',other_option from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_forged_class_plan','insert into public.academy_student_monthly_plans(student_id,branch_id,effective_month,item_type,class_schedule_id) select own_student,own_branch,next_month,''class'',other_class from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_forged_origin_plan','insert into public.academy_student_monthly_plans(student_id,branch_id,effective_month,item_type,package_option_id,billing_source,origin_plan_id) select own_student,own_branch,next_month,''package'',own_option,''additional'',other_plan from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_forged_revision','insert into public.academy_student_billing_plan_revisions(student_id,branch_id,effective_month) select other_student,own_branch,next_month from tester_monthly_context',0,true);
select pg_temp.tester_probe('monthly_own_read_academy_student_monthly_plans','select id from public.academy_student_monthly_plans where id=(select own_plan from tester_monthly_context)',1);
select pg_temp.tester_probe('monthly_other_read_academy_student_monthly_plans','select id from public.academy_student_monthly_plans where id=(select other_plan from tester_monthly_context)',0);
select pg_temp.tester_probe('monthly_other_delete_academy_student_monthly_plans','delete from public.academy_student_monthly_plans where id=(select other_plan from tester_monthly_context)',0,true);
select pg_temp.tester_probe('monthly_own_read_academy_student_billing_plan_revisions','select student_id from public.academy_student_billing_plan_revisions where student_id=(select own_student from tester_monthly_context)',1);
select pg_temp.tester_probe('monthly_other_read_academy_student_billing_plan_revisions','select student_id from public.academy_student_billing_plan_revisions where student_id=(select other_student from tester_monthly_context)',0);
select pg_temp.tester_probe('monthly_other_delete_academy_student_billing_plan_revisions','delete from public.academy_student_billing_plan_revisions where student_id=(select other_student from tester_monthly_context)',0,true);

reset role;
-- Snapshot stays in transaction-local memory; customer data is never returned.
create function pg_temp.tester_monthly_snapshot()
returns jsonb language sql security invoker as $snapshot$
  select jsonb_build_object(
    'plans',(select jsonb_agg(to_jsonb(p) order by p.id) from public.academy_student_monthly_plans p where student_id=c.own_student),
    'revisions',(select jsonb_agg(to_jsonb(r) order by r.effective_month) from public.academy_student_billing_plan_revisions r where student_id=c.own_student),
    'assignments',(select jsonb_agg(to_jsonb(a) order by a.id) from public.student_schedule_assignments a where child_id=c.own_child),
    'reservations',(select jsonb_agg(to_jsonb(r) order by r.id) from public.reservations r where child_id=c.own_child))
  from tester_monthly_context c;
$snapshot$;
set local role authenticated;
select pg_temp.tester_probe('monthly_second_stage_failure_atomic', $probe$
  do $flow$ declare before_state jsonb; rejected boolean:=false; c record; begin
    select * into strict c from tester_monthly_context;
    before_state:=pg_temp.tester_monthly_snapshot();
    begin
      -- Current phase is valid; future phase rejects the non-future month.
      perform public.save_student_schedule_and_billing_all_months(c.own_student,array[c.own_class],array[c.own_option],
        false,c.current_month,array[c.own_class],array[c.own_option],true);
    exception when raise_exception then rejected:=sqlerrm like '적용 월%'; end;
    if not rejected or pg_temp.tester_monthly_snapshot() is distinct from before_state
    then raise exception 'TESTER_MONTHLY_PARTIAL_WRITE'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('monthly_duplicate_class_failure_atomic', $probe$
  do $flow$ declare before_state jsonb; rejected boolean:=false; c record; begin
    select * into strict c from tester_monthly_context;
    before_state:=pg_temp.tester_monthly_snapshot();
    begin
      perform public.save_student_schedule_and_billing_all_months(c.own_student,array[c.own_class,c.own_class],array[c.own_option],
        false,c.next_month,array[c.own_class],array[c.own_option],true);
    exception when raise_exception then rejected:=sqlerrm='동일한 수업이 중복 선택되었습니다.'; end;
    if not rejected or pg_temp.tester_monthly_snapshot() is distinct from before_state
    then raise exception 'TESTER_MONTHLY_DUPLICATE_PARTIAL_WRITE'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('monthly_processed_attendance_preserved', $probe$
  do $flow$ declare c record; a uuid; r uuid; begin
    select * into strict c from tester_monthly_context;
    -- Seed processed attendance only inside this rolled-back probe.
    perform public.sync_current_month_child_schedule(c.own_parent,c.own_child,array[c.own_class]);
    select id into strict a from public.student_schedule_assignments where child_id=c.own_child and starts_on=c.today;
    insert into public.reservations(user_id,child_id,branch_id,schedule_id,assignment_id,class_date,status,attendance_status)
    values(c.own_parent,c.own_child,c.own_branch,c.own_class,a,c.today,'confirmed','출석')
    on conflict(assignment_id,class_date) where assignment_id is not null
      do update set attendance_status='출석',status='confirmed' returning id into r;
    perform public.sync_current_and_next_month_student_schedules(c.own_student,array[]::uuid[],false);
    if not exists(select 1 from public.reservations where id=r and attendance_status='출석' and status='confirmed')
      or not exists(select 1 from public.student_schedule_assignments where id=a and ends_on=c.today)
    then raise exception 'TESTER_MONTHLY_ATTENDANCE_CHANGED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('monthly_confirmed_bill_cannot_remove_option', $probe$
  do $flow$ declare c record; b uuid; before_state jsonb; rejected boolean:=false; begin
    select * into strict c from tester_monthly_context;
    perform public.save_current_month_student_billing_draft(c.own_student,array[c.own_option]);
    insert into public.academy_bills(student_id,branch_id,bill_month,amount_due,original_amount,package_option_id)
    values(c.own_student,c.own_branch,to_char(c.current_month,'YYYY-MM'),100,100,c.own_option) returning id into b;
    before_state:=pg_temp.tester_monthly_snapshot();
    begin
      perform public.save_current_month_student_billing_draft(c.own_student,array[]::uuid[]);
    exception when raise_exception then rejected:=sqlerrm like '이미 청구 또는 갱신 완료%'; end;
    if not rejected or pg_temp.tester_monthly_snapshot() is distinct from before_state
      or not exists(select 1 from public.academy_bills where id=b and amount_due=100 and package_option_id=c.own_option)
    then raise exception 'TESTER_MONTHLY_LOCKED_BILL_CHANGED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('monthly_locked_same_option_repeat_no_bill_creation', $probe$
  do $flow$ declare c record; b uuid; result jsonb; begin
    select * into strict c from tester_monthly_context;
    perform public.save_current_month_student_billing_draft(c.own_student,array[c.own_option]);
    insert into public.academy_bills(student_id,branch_id,bill_month,amount_due,original_amount,package_option_id)
    values(c.own_student,c.own_branch,to_char(c.current_month,'YYYY-MM'),100,100,c.own_option) returning id into b;
    for i in 1..2 loop
      result:=public.save_current_month_student_billing_draft(c.own_student,array[c.own_option]);
      if (result->>'locked_count')::int is distinct from 1 then raise exception 'TESTER_MONTHLY_LOCK_RESULT'; end if;
    end loop;
    if (select count(*) from public.academy_bills where student_id=c.own_student)<>1
      or (select count(*) from public.academy_student_monthly_plans where student_id=c.own_student
        and effective_month=c.current_month and package_option_id=c.own_option and status='applied')<>1
    then raise exception 'TESTER_MONTHLY_LOCK_DUPLICATION'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('monthly_clear_unconfirmed_plans', $probe$
  do $flow$ declare c record; begin
    select * into strict c from tester_monthly_context;
    perform public.save_student_schedule_and_billing_all_months(c.own_student,array[c.own_class],array[c.own_option],
      false,c.next_month,array[c.own_class],array[c.own_option],true);
    perform public.save_student_schedule_and_billing_all_months(c.own_student,array[]::uuid[],array[]::uuid[],
      false,c.next_month,array[]::uuid[],array[]::uuid[],true);
    if exists(select 1 from public.academy_student_monthly_plans where student_id=c.own_student
        and effective_month in(c.current_month,c.next_month) and status='planned')
      or exists(select 1 from public.reservations where child_id=c.own_child and class_date>=c.today)
    then raise exception 'TESTER_MONTHLY_CLEAR_FAILED'; end if;
  end $flow$;
$probe$,0);
reset role;
update public.users set status='deleted' where id=(select actor from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('monthly_suspended_'||label,own_statement,0,true) from tester_monthly_requests;
reset role;
update public.users set status='active' where id=(select actor from tester_probe_context);
update auth.users set raw_app_meta_data=raw_app_meta_data-'ipasscare_tester'-'ipasscare_test_branch'
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated',
  'app_metadata',json_build_object('ipasscare_tester',true,'ipasscare_test_branch',own_branch))::text,true) from tester_probe_context;
set local role authenticated;
select pg_temp.tester_probe('monthly_revoked_'||label,own_statement,0,true) from tester_monthly_requests;
select pg_temp.tester_probe('monthly_revoked_read_denied','select id from public.academy_student_monthly_plans',0);
reset role;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
  ||jsonb_build_object('ipasscare_tester',true,'ipasscare_test_branch',(select own_branch from tester_probe_context))
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true) from tester_probe_context;
select set_config('request.jwt.claims',json_build_object('role','anon')::text,true);
set local role anon;
select pg_temp.tester_probe('monthly_anon_'||label,own_statement,0,true) from tester_monthly_requests;
reset role;
