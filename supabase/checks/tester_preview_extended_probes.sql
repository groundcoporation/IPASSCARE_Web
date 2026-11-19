-- Runs after manual fixtures, inside the same rollback-only transaction.
alter table tester_probe_context
  add column own_study uuid default gen_random_uuid(), add column other_study uuid default gen_random_uuid(),
  add column own_counsel uuid default gen_random_uuid(), add column other_counsel uuid default gen_random_uuid();
insert into public.academy_study_logs(id,branch_id,student_id,class_name,title,content,is_parent_visible)
select own_study,own_branch,own_student,'tester-audit','tester-audit','synthetic',true from tester_probe_context
union all select other_study,other_branch,other_student,'tester-audit','tester-audit','synthetic',true from tester_probe_context;
insert into public.academy_counsel_logs(id,branch_id,student_id,content,is_parent_visible)
select own_counsel,own_branch,own_student,'synthetic',true from tester_probe_context
union all select other_counsel,other_branch,other_student,'synthetic',true from tester_probe_context;
create function pg_temp.tester_assert(label text, expected boolean)
returns void language plpgsql security invoker as $$
begin insert into tester_write_results values(label,coalesce(expected,false),null); end $$;
select pg_temp.tester_assert('journal_parent_copies_created',
  (select count(*)=4 from public.parent_journal_entries where source_id in (
    select own_study from tester_probe_context union all select other_study from tester_probe_context
    union all select own_counsel from tester_probe_context union all select other_counsel from tester_probe_context)));
set local role authenticated;
select pg_temp.tester_assert('own_users_visible',exists(select 1 from public.users where id=(select actor from tester_probe_context)));
select pg_temp.tester_assert('other_users_hidden',not exists(select 1 from public.users where branch_id is distinct from (select own_branch from tester_probe_context)));
select pg_temp.tester_assert('own_pass_visible',exists(select 1 from public.user_packages where id=(select own_pass from tester_manual_context)));
select pg_temp.tester_assert('other_passes_hidden',not exists(select 1 from public.user_packages where branch_id is distinct from (select own_branch from tester_probe_context)));
select pg_temp.tester_assert('own_reservation_visible',exists(select 1 from public.reservations where id=(select own_reservation from tester_manual_context)));
select pg_temp.tester_assert('other_reservations_hidden',not exists(select 1 from public.reservations where branch_id is distinct from (select own_branch from tester_probe_context)));
select pg_temp.tester_assert('own_study_visible',exists(select 1 from public.academy_study_logs where id=(select own_study from tester_probe_context)));
select pg_temp.tester_assert('other_study_hidden',not exists(select 1 from public.academy_study_logs where id=(select other_study from tester_probe_context)));
select pg_temp.tester_assert('own_counsel_visible',exists(select 1 from public.academy_counsel_logs where id=(select own_counsel from tester_probe_context)));
select pg_temp.tester_assert('other_counsel_hidden',not exists(select 1 from public.academy_counsel_logs where id=(select other_counsel from tester_probe_context)));
select pg_temp.tester_assert('other_parent_journal_hidden',not exists(select 1 from public.parent_journal_entries where branch_id is distinct from (select own_branch from tester_probe_context)));
select pg_temp.tester_assert('api_keys_client_read_denied',not exists(select 1 from public.api_keys));
select pg_temp.tester_probe('own_study_edit_allowed',
  'update public.academy_study_logs set content=''synthetic edited'' where id=(select own_study from tester_probe_context)',1);
select pg_temp.tester_probe('other_study_edit_denied',
  'update public.academy_study_logs set content=''synthetic edited'' where id=(select other_study from tester_probe_context)',0);
select pg_temp.tester_probe('own_counsel_edit_allowed',
  'update public.academy_counsel_logs set content=''synthetic edited'' where id=(select own_counsel from tester_probe_context)',1);
select pg_temp.tester_probe('other_counsel_delete_denied',
  'delete from public.academy_counsel_logs where id=(select other_counsel from tester_probe_context)',0);
select pg_temp.tester_probe('forged_student_study_denied',
  'insert into public.academy_study_logs(branch_id,student_id,class_name,title,content) select own_branch,other_student,''tester-audit'',''tester-audit'',''synthetic'' from tester_probe_context',0,true);
select pg_temp.tester_probe('forged_student_counsel_denied',
  'insert into public.academy_counsel_logs(branch_id,student_id,content) select own_branch,other_student,''synthetic'' from tester_probe_context',0,true);
select pg_temp.tester_probe('other_pass_edit_denied',
  'update public.user_packages set remaining_count=999 where id=(select other_pass from tester_manual_context)',0);
select pg_temp.tester_probe('forged_child_reservation_denied',
  'insert into public.reservations(branch_id,user_id,child_id,class_date) select own_branch,own_parent,other_child,today+2 from tester_manual_context',0,true);
select pg_temp.tester_probe('rpc_self_admin_role_denied',
  'select public.update_member_role((select actor from tester_probe_context),''admin'')',0,true);
select pg_temp.tester_probe('rpc_other_member_role_denied',
  'select public.update_member_role((select other_parent from tester_probe_context),''teacher'')',0,true);
select pg_temp.tester_probe('rpc_own_member_role_allowed',
  'select public.update_member_role((select own_parent from tester_manual_context),''teacher'')',1);
select pg_temp.tester_assert('rpc_member_list_scoped',
  exists(select 1 from public.list_role_manageable_members(null))
  and not exists(select 1 from public.list_role_manageable_members((select other_branch from tester_probe_context))
    where branch_id is distinct from (select own_branch from tester_probe_context)));
reset role;
-- Server-side account suspension must also apply to SECURITY DEFINER RPCs.
update public.users set status='deleted' where id=(select actor from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('suspended_tester_role_rpc_denied',
  'select public.update_member_role((select own_parent from tester_manual_context),''teacher'')',0,true);
reset role;
update public.users set status='active' where id=(select actor from tester_probe_context);
-- A cached JWT keeps its old marker after the server revokes tester access.
update auth.users set raw_app_meta_data=raw_app_meta_data-'ipasscare_tester'-'ipasscare_test_branch'
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated',
  'app_metadata',json_build_object('ipasscare_tester',true,'ipasscare_test_branch',own_branch))::text,true) from tester_probe_context;
set local role authenticated;
select pg_temp.tester_assert('revoked_cached_token_no_users',not exists(select 1 from public.users));
select pg_temp.tester_assert('revoked_cached_token_no_reservations',not exists(select 1 from public.reservations));
select pg_temp.tester_probe('revoked_cached_token_list_rpc_denied',
  'select * from public.list_role_manageable_members(null)',0,true);
select pg_temp.tester_probe('revoked_cached_token_role_rpc_denied',
  'select public.update_member_role((select own_parent from tester_manual_context),''teacher'')',0,true);
reset role;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
  ||jsonb_build_object('ipasscare_tester',true,'ipasscare_test_branch',(select own_branch from tester_probe_context))
where id=(select actor from tester_probe_context);
select set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true) from tester_probe_context;
