-- Fixtures and outbox entries live only until the enclosing ROLLBACK.
reset role;
alter table tester_probe_context add column own_notice uuid default gen_random_uuid(),add column other_notice uuid default gen_random_uuid();
insert into public.notices(id,title,content,author_name,branch_id)
select own_notice,'synthetic','synthetic','가상 담당자',own_branch from tester_probe_context
union all select other_notice,'synthetic','synthetic','가상 담당자',other_branch from tester_probe_context;
do $$ begin
  if exists(select 1 from public.attendance_logs where id=-9000000000010)
    then raise exception 'TESTER_ACTIVITY_FIXTURE_COLLISION'; end if;
end $$;
insert into public.attendance_logs(id,child_id,branch_id,date,status,check_in,method)
select -9000000000010,own_child,own_branch,today,'등원',now(),'웹' from tester_manual_context;
create function pg_temp.tester_activity_ok(operation text,payload jsonb)
returns void language plpgsql security invoker as $$
declare request uuid:=gen_random_uuid(); first jsonb; repeated jsonb; notifications_before integer;
begin
  select count(*) into notifications_before from public.notifications;
  first:=public.simulate_tester_activity_notification(operation,payload,request);
  repeated:=public.simulate_tester_activity_notification(operation,payload,request);
  if first->>'testMode' is distinct from 'true' or first->>'externalDelivery' is distinct from 'false'
    or (first->>'sentCount')::integer is distinct from 0 or (first->>'targetCount')::integer<1
    or first is distinct from repeated
    or (select count(*) from public.notifications) is distinct from notifications_before
    then raise exception 'TESTER_VIRTUAL_ACTIVITY_FAILED'; end if;
end $$;
set local role authenticated;
select pg_temp.tester_probe('virtual_study_notification',
  'select pg_temp.tester_activity_ok(''send-journal-notification'',jsonb_build_object(''journalType'',''study'',''journalId'',(select own_study from tester_probe_context)))',1);
select pg_temp.tester_probe('virtual_counsel_notification',
  'select pg_temp.tester_activity_ok(''send-journal-notification'',jsonb_build_object(''journalType'',''counsel'',''journalId'',(select own_counsel from tester_probe_context)))',1);
select pg_temp.tester_probe('virtual_notice_notification',
  'select pg_temp.tester_activity_ok(''send-notice-push'',jsonb_build_object(''noticeId'',(select own_notice from tester_probe_context)))',1);
select pg_temp.tester_probe('virtual_attendance_notification',
  'select pg_temp.tester_activity_ok(''send-attendance-notification'',(select jsonb_build_object(''child_id'',own_child,''branch_id'',own_branch,''service_date'',today,''action'',''check_in'') from tester_manual_context))',1);
select pg_temp.tester_probe('virtual_other_study_notification_denied',
  'select public.simulate_tester_activity_notification(''send-journal-notification'',jsonb_build_object(''journalType'',''study'',''journalId'',(select other_study from tester_probe_context)),gen_random_uuid())',0,true);
select pg_temp.tester_probe('virtual_other_counsel_notification_denied',
  'select public.simulate_tester_activity_notification(''send-journal-notification'',jsonb_build_object(''journalType'',''counsel'',''journalId'',(select other_counsel from tester_probe_context)),gen_random_uuid())',0,true);
select pg_temp.tester_probe('virtual_other_notice_notification_denied',
  'select public.simulate_tester_activity_notification(''send-notice-push'',jsonb_build_object(''noticeId'',(select other_notice from tester_probe_context)),gen_random_uuid())',0,true);
select pg_temp.tester_probe('virtual_other_attendance_notification_denied',
  'select public.simulate_tester_activity_notification(''send-attendance-notification'',(select jsonb_build_object(''child_id'',other_child,''branch_id'',own_branch,''service_date'',today,''action'',''check_in'') from tester_manual_context),gen_random_uuid())',0,true);
select pg_temp.tester_expect_error('virtual_unsaved_attendance_notification_denied',
  'select public.simulate_tester_activity_notification(''send-attendance-notification'',(select jsonb_build_object(''child_id'',own_child,''branch_id'',own_branch,''service_date'',today,''action'',''check_out'') from tester_manual_context),gen_random_uuid())','INPUT_INVALID');
reset role;
update public.academy_study_logs set is_parent_visible=false where id=(select own_study from tester_probe_context);
set local role authenticated;
select pg_temp.tester_expect_error('virtual_private_journal_notification_denied',
  'select public.simulate_tester_activity_notification(''send-journal-notification'',jsonb_build_object(''journalType'',''study'',''journalId'',(select own_study from tester_probe_context)),gen_random_uuid())','INPUT_INVALID');
reset role;
update public.academy_study_logs set is_parent_visible=true where id=(select own_study from tester_probe_context);
set local role anon;
select pg_temp.tester_probe('virtual_activity_anonymous_denied',
  'select public.simulate_tester_activity_notification(''send-notice-push'',jsonb_build_object(''noticeId'',(select own_notice from tester_probe_context)),gen_random_uuid())',0,true);
reset role;
update public.users set status='deleted' where id=(select actor from tester_probe_context);
set local role authenticated;
select pg_temp.tester_probe('virtual_activity_suspended_denied',
  'select public.simulate_tester_activity_notification(''send-notice-push'',jsonb_build_object(''noticeId'',(select own_notice from tester_probe_context)),gen_random_uuid())',0,true);
reset role;
update public.users set status='active' where id=(select actor from tester_probe_context);
