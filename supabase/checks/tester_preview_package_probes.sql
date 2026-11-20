-- Pass/additional billing checks. Synthetic fixtures; outer transaction rolls back.
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true) from tester_probe_context;
create temporary table tester_package_context as
select m.*,gen_random_uuid() own_standard,gen_random_uuid() other_standard,
  gen_random_uuid() own_additional,gen_random_uuid() other_additional,
  gen_random_uuid() own_correct_option,gen_random_uuid() other_correct_option,
  gen_random_uuid() own_extra_option,gen_random_uuid() other_extra_option,
  gen_random_uuid() own_new_option,gen_random_uuid() other_new_option,
  gen_random_uuid() own_pass,gen_random_uuid() other_pass,
  gen_random_uuid() own_request,gen_random_uuid() other_request
from tester_monthly_context m;
grant select on tester_package_context to authenticated,anon;
insert into public.package_options(id,package_id,branch_id,label,price,total_count)
select own_correct_option,own_product,own_branch,'synthetic-correction',200,3 from tester_package_context
union all select other_correct_option,other_product,other_branch,'synthetic-correction',200,3 from tester_package_context
union all select own_extra_option,own_product,own_branch,'synthetic-extra-existing',250,3 from tester_package_context
union all select other_extra_option,other_product,other_branch,'synthetic-extra-existing',250,3 from tester_package_context
union all select own_new_option,own_product,own_branch,'synthetic-extra-new',300,3 from tester_package_context
union all select other_new_option,other_product,other_branch,'synthetic-extra-new',300,3 from tester_package_context;
insert into public.academy_student_monthly_plans(id,student_id,branch_id,effective_month,item_type,package_option_id,status,billing_source)
select own_standard,own_student,own_branch,current_month,'package',own_option,'applied','standard' from tester_package_context
union all select other_standard,other_student,other_branch,current_month,'package',other_option,'applied','standard' from tester_package_context
union all select own_additional,own_student,own_branch,current_month,'package',own_extra_option,'planned','additional' from tester_package_context
union all select other_additional,other_student,other_branch,current_month,'package',other_extra_option,'planned','additional' from tester_package_context;
insert into public.user_packages(id,user_id,child_id,branch_id,package_id,option_id,beneficiary_type,status,voucher_type,
  remaining_count,total_count,valid_from,valid_until,expiry_date)
select own_pass,own_parent,own_child,own_branch,own_product,own_correct_option,'child','active','lesson',3,3,
  current_month,(next_month-1),(next_month-1)::timestamptz from tester_package_context
union all select other_pass,other_parent,other_child,other_branch,other_product,other_correct_option,'child','active','lesson',3,3,
  current_month,(next_month-1),(next_month-1)::timestamptz from tester_package_context;
-- Correction-log fixtures are synthetic and never delivered externally.
insert into public.academy_billing_plan_correction_logs(student_id,branch_id,effective_month,changed_by)
select own_student,own_branch,current_month,(select actor from tester_probe_context) from tester_package_context
union all select other_student,other_branch,current_month,(select actor from tester_probe_context) from tester_package_context;
set local role authenticated;
select pg_temp.tester_probe('package_additional_create_and_duplicate_rejected', $probe$
  do $flow$ declare c record; result jsonb; rejected boolean:=false; begin
    select * into strict c from tester_package_context;
    result:=public.add_current_month_student_additional_billing_plan(c.own_student,c.own_new_option);
    begin
      perform public.add_current_month_student_additional_billing_plan(c.own_student,c.own_new_option);
    exception when raise_exception then rejected:=sqlerrm like '같은 이용권은%'; end;
    if result->>'success' is distinct from 'true' or not rejected
      or (select count(*) from public.academy_student_monthly_plans where student_id=c.own_student
        and effective_month=c.current_month and package_option_id=c.own_new_option and billing_source='additional')<>1
    then raise exception 'TESTER_ADDITIONAL_DUPLICATION'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('package_additional_delete_planned', $probe$
  do $flow$ declare c record; result jsonb; begin
    select * into strict c from tester_package_context;
    result:=public.delete_planned_additional_student_billing_item(c.own_additional);
    if result->>'success' is distinct from 'true' or exists(select 1 from public.academy_student_monthly_plans where id=c.own_additional)
      or not exists(select 1 from public.academy_student_monthly_plans where id=c.own_standard and status='applied')
    then raise exception 'TESTER_ADDITIONAL_DELETE_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('package_additional_billed_delete_rejected', $probe$
  do $flow$ declare c record; rejected boolean:=false; begin
    select * into strict c from tester_package_context;
    insert into public.academy_bills(student_id,branch_id,bill_month,amount_due,package_option_id)
    values(c.own_student,c.own_branch,to_char(c.current_month,'YYYY-MM'),250,c.own_extra_option);
    begin
      perform public.delete_planned_additional_student_billing_item(c.own_additional);
    exception when raise_exception then rejected:=sqlerrm like '이미 청구서가 생성된%'; end;
    if not rejected or not exists(select 1 from public.academy_student_monthly_plans where id=c.own_additional)
    then raise exception 'TESTER_BILLED_ADDITIONAL_DELETED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('package_correction_repeat_one_log_no_pass_change', $probe$
  do $flow$ declare c record; first_result jsonb; repeated jsonb; before_count int; pass_before jsonb; begin
    select * into strict c from tester_package_context;
    select count(*) into before_count from public.academy_billing_plan_correction_logs where student_id=c.own_student;
    select to_jsonb(u) into pass_before from public.user_packages u where id=c.own_pass;
    first_result:=public.correct_billing_plan_to_owned_package(c.own_standard,c.own_pass);
    repeated:=public.correct_billing_plan_to_owned_package(c.own_standard,c.own_pass);
    if first_result->>'changed' is distinct from 'true' or repeated->>'changed' is distinct from 'false'
      or (select count(*) from public.academy_billing_plan_correction_logs where student_id=c.own_student)<>before_count+1
      or not exists(select 1 from public.academy_student_monthly_plans where id=c.own_standard
        and package_option_id=c.own_correct_option and status='applied')
      or (select to_jsonb(u) from public.user_packages u where id=c.own_pass) is distinct from pass_before
    then raise exception 'TESTER_CORRECTION_DUPLICATED_OR_PASS_CHANGED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('package_own_revoke_status',
  'update public.user_packages set status=''inactive'' where id=(select own_pass from tester_package_context)',1);
select pg_temp.tester_probe('package_other_revoke_denied',
  'update public.user_packages set status=''inactive'' where id=(select other_pass from tester_package_context)',0,true);
select pg_temp.tester_probe('package_forged_parent_denied',
  'update public.user_packages set user_id=(select other_parent from tester_package_context) where id=(select own_pass from tester_package_context)',0,true);
select pg_temp.tester_probe('package_forged_option_denied',
  'update public.user_packages set option_id=(select other_option from tester_package_context) where id=(select own_pass from tester_package_context)',0,true);
select pg_temp.tester_probe('package_other_correction_logs_hidden',
  'select id from public.academy_billing_plan_correction_logs where student_id=(select other_student from tester_package_context)',0);
select pg_temp.tester_probe('package_own_correction_logs_visible',
  'select id from public.academy_billing_plan_correction_logs where student_id=(select own_student from tester_package_context)',1);
select pg_temp.tester_probe('package_correction_log_direct_write_denied',
  'insert into public.academy_billing_plan_correction_logs(student_id,branch_id,effective_month,changed_by) select own_student,own_branch,current_month,(select actor from tester_probe_context) from tester_package_context',0,true);
select pg_temp.tester_probe('package_grant_current_own', $probe$
  do $flow$ declare c record; result jsonb; begin
    select * into strict c from tester_package_context;
    result:=public.grant_tester_member_package_with_schedule(c.own_request,c.own_parent,c.own_child,c.own_new_option,c.current_month,array[c.own_class]);
    if result->>'success' is distinct from 'true'
      or not exists(select 1 from public.user_packages where id=(result->>'package_id')::uuid
        and child_id=c.own_child and branch_id=c.own_branch and total_count=3 and remaining_count=3)
    then raise exception 'TESTER_PACKAGE_GRANT_FAILED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('package_grant_repeat_same_request_once', $probe$
  do $flow$ declare c record; first_result jsonb; repeated jsonb; begin
    select * into strict c from tester_package_context;
    first_result:=public.grant_tester_member_package_with_schedule(c.own_request,c.own_parent,c.own_child,c.own_new_option,c.current_month,array[c.own_class]);
    repeated:=public.grant_tester_member_package_with_schedule(c.own_request,c.own_parent,c.own_child,c.own_new_option,c.current_month,array[c.own_class]);
    if first_result->>'package_id' is distinct from repeated->>'package_id'
      or repeated->>'replayed' is distinct from 'true'
      or (select count(*) from public.user_packages where child_id=c.own_child and option_id=c.own_new_option)<>1
    then raise exception 'TESTER_PACKAGE_GRANT_DUPLICATED'; end if;
  end $flow$;
$probe$,0);
reset role;
create temporary table tester_package_requests(label text,own_statement text,other_statement text);
insert into tester_package_requests values
 ('additional','select public.add_current_month_student_additional_billing_plan(own_student,own_new_option) from tester_package_context',
   'select public.add_current_month_student_additional_billing_plan(other_student,other_new_option) from tester_package_context'),
 ('delete','select public.delete_planned_additional_student_billing_item(own_additional) from tester_package_context',
   'select public.delete_planned_additional_student_billing_item(other_additional) from tester_package_context'),
 ('correct','select public.correct_billing_plan_to_owned_package(own_standard,own_pass) from tester_package_context',
   'select public.correct_billing_plan_to_owned_package(other_standard,other_pass) from tester_package_context'),
 ('grant','select public.grant_tester_member_package_with_schedule(own_request,own_parent,own_child,own_new_option,current_month,array[own_class]) from tester_package_context',
   'select public.grant_tester_member_package_with_schedule(other_request,other_parent,other_child,other_new_option,current_month,array[other_class]) from tester_package_context'),
 ('assign','select public.sync_current_month_child_schedule_with_package(own_parent,own_child,own_pass,array[own_class]) from tester_package_context',
   'select public.sync_current_month_child_schedule_with_package(other_parent,other_child,other_pass,array[other_class]) from tester_package_context');
grant select on tester_package_requests to authenticated,anon;
set local role authenticated;
select pg_temp.tester_probe('package_other_rpc_'||label,other_statement,0,true) from tester_package_requests;
select pg_temp.tester_probe('package_foreign_option_additional_denied',
 'select public.add_current_month_student_additional_billing_plan(own_student,other_new_option) from tester_package_context',0,true);
select pg_temp.tester_probe('package_foreign_pass_correction_denied',
 'select public.correct_billing_plan_to_owned_package(own_standard,other_pass) from tester_package_context',0,true);
select pg_temp.tester_probe('package_foreign_class_grant_denied',
 'select public.grant_tester_member_package_with_schedule(own_request,own_parent,own_child,own_new_option,current_month,array[other_class]) from tester_package_context',0,true);
select pg_temp.tester_probe('package_foreign_child_grant_denied',
 'select public.grant_tester_member_package_with_schedule(own_request,own_parent,other_child,own_new_option,current_month,array[own_class]) from tester_package_context',0,true);
select pg_temp.tester_probe('package_foreign_option_grant_denied',
 'select public.grant_tester_member_package_with_schedule(own_request,own_parent,own_child,other_new_option,current_month,array[own_class]) from tester_package_context',0,true);
select pg_temp.tester_probe('package_legacy_grant_tester_denied',
 'select public.grant_member_package_with_schedule(own_parent,own_child,own_new_option,current_month,array[own_class]) from tester_package_context',0,true);
select pg_temp.tester_probe('package_private_grant_direct_denied',
 'select ipasscare_preview_access.grant_member_package_with_schedule(own_parent,own_child,own_new_option,current_month,array[own_class]) from tester_package_context',0,true);
select pg_temp.tester_probe('package_private_request_log_denied',
 'select * from ipasscare_preview_access.package_grant_requests',0,true);
select pg_temp.tester_probe('package_grant_changed_payload_conflict', $probe$
  do $flow$ declare c record; rejected boolean:=false; begin
    select * into strict c from tester_package_context;
    perform public.grant_tester_member_package_with_schedule(c.own_request,c.own_parent,c.own_child,c.own_new_option,c.current_month,array[c.own_class]);
    begin
      perform public.grant_tester_member_package_with_schedule(c.own_request,c.own_parent,c.own_child,c.own_extra_option,c.current_month,array[c.own_class]);
    exception when raise_exception then rejected:=sqlerrm='[CONFLICT_ERROR]'; end;
    if not rejected or (select count(*) from public.user_packages where child_id=c.own_child and option_id=c.own_new_option)<>1
    then raise exception 'TESTER_PACKAGE_REQUEST_PAYLOAD_CHANGED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('package_grant_failed_transaction_retry_same_key', $probe$
  do $flow$ declare c record; rejected boolean:=false; result jsonb; begin
    select * into strict c from tester_package_context;
    begin
      -- Legacy body inserts a pass before schedule validation; the whole wrapper must roll back.
      perform public.grant_tester_member_package_with_schedule(c.own_request,c.own_parent,c.own_child,c.own_new_option,c.current_month,array[c.own_class,c.own_class]);
    exception when raise_exception then rejected:=sqlerrm='동일한 수업이 중복 선택되었습니다.'; end;
    if not rejected or exists(select 1 from public.user_packages where child_id=c.own_child and option_id=c.own_new_option)
    then raise exception 'TESTER_PACKAGE_PARTIAL_GRANT'; end if;
    -- This is a confirmed rollback in a subtransaction, not an automatic network retry.
    result:=public.grant_tester_member_package_with_schedule(c.own_request,c.own_parent,c.own_child,c.own_new_option,c.current_month,array[c.own_class]);
    if result->>'replayed' is distinct from 'false'
      or (select count(*) from public.user_packages where child_id=c.own_child and option_id=c.own_new_option)<>1
    then raise exception 'TESTER_PACKAGE_FAILED_REQUEST_CACHED'; end if;
  end $flow$;
$probe$,0);
select pg_temp.tester_probe('package_grant_next_month', $probe$
  do $flow$ declare c record; result jsonb; begin
    select * into strict c from tester_package_context;
    result:=public.grant_tester_member_package_with_schedule(c.own_request,c.own_parent,c.own_child,c.own_new_option,c.next_month,array[c.own_class]);
    if result->>'success' is distinct from 'true'
      or not exists(select 1 from public.user_packages where id=(result->>'package_id')::uuid and valid_from=c.next_month)
      or not exists(select 1 from public.student_schedule_assignments where child_id=c.own_child and starts_on=c.next_month and schedule_id=c.own_class)
    then raise exception 'TESTER_PACKAGE_FUTURE_GRANT_FAILED'; end if;
  end $flow$;
$probe$,0);
reset role;
update public.users set status='deleted' where id=(select actor from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('package_suspended_'||label,own_statement,0,true) from tester_package_requests;
reset role;
update public.users set status='active' where id=(select actor from tester_probe_context);
update auth.users set raw_app_meta_data=raw_app_meta_data-'ipasscare_tester'-'ipasscare_test_branch'
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated',
 'app_metadata',json_build_object('ipasscare_tester',true,'ipasscare_test_branch',own_branch))::text,true) from tester_probe_context;
set local role authenticated;
select pg_temp.tester_probe('package_revoked_'||label,own_statement,0,true) from tester_package_requests;
reset role;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
 ||jsonb_build_object('ipasscare_tester',true,'ipasscare_test_branch',(select own_branch from tester_probe_context))
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('role','anon')::text,true);
set local role anon;
select pg_temp.tester_probe('package_anon_'||label,own_statement,0,true) from tester_package_requests;
reset role;
