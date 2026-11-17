-- Local-only synthetic fixtures, executed with both migrations in one rollback transaction.
do $fixture$
declare
  director uuid := gen_random_uuid();
  parent uuid := gen_random_uuid();
  child uuid := gen_random_uuid();
  student uuid;
  other_student uuid := gen_random_uuid();
  local_request uuid := gen_random_uuid();
  remote_request uuid := gen_random_uuid();
  web_request uuid := gen_random_uuid();
  paid_request uuid := gen_random_uuid();
  linked_request uuid := gen_random_uuid();
  bill uuid := gen_random_uuid();
  internal_study uuid := gen_random_uuid();
  public_study uuid := gen_random_uuid();
  private_counsel uuid := gen_random_uuid();
  other_counsel uuid := gen_random_uuid();
  future_reservation uuid := gen_random_uuid();
  past_reservation uuid := gen_random_uuid();
  lesson_pass uuid := gen_random_uuid();
  branch text := 'core-test-' || gen_random_uuid()::text;
  other_branch text := 'core-test-' || gen_random_uuid()::text;
  result jsonb;
  service_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  insert into public.branches(id,name) values(branch,'Local core test'),(other_branch,'Local second branch');
  insert into auth.users(id,email) values(director,director || '@example.invalid'),(parent,parent || '@example.invalid');
  insert into public.users(id,role,branch_id,status) values(director,'director',branch,'active'),(parent,'user',branch,'active')
    on conflict(id) do update set role=excluded.role,branch_id=excluded.branch_id,status=excluded.status;
  insert into public.children(id,parent_id,child_name,branch_id) values(child,parent,'Local fixture',branch);
  select id into strict student from public.academy_students where child_id=child;
  insert into public.academy_students(id,branch_id,student_name,attendance_code)
    values(other_student,other_branch,'Separate fixture',substr(other_student::text,1,8));
  insert into public.user_packages(id,user_id,child_id,branch_id,total_count,remaining_count,status,beneficiary_type)
    values(lesson_pass,parent,child,branch,2,1,'active','child');
  insert into public.reservations(id,child_id,user_id,branch_id,package_id,class_date,status,attendance_status)
    values(future_reservation,child,parent,branch,lesson_pass,service_day+1,'pending','yet'),
          (past_reservation,child,parent,branch,lesson_pass,service_day-1,'pending','등원');
  insert into public.academy_billing_automation_targets(branch_id,student_id,is_enabled) values(branch,student,true);

  insert into public.payment_requests(id,order_no,parent_id,parent_name,branch_id,total_amount,cart_items,status,issued_source)
  values (local_request,local_request::text,parent,'Local',branch,1000,'[]','pending','admin_app'),
    (remote_request,remote_request::text,parent,'Local',other_branch,1000,'[]','pending','admin_app'),
    (web_request,web_request::text,parent,'Local',branch,1000,'[]','pending','manual'),
    (paid_request,paid_request::text,parent,'Local',branch,1000,'[]','paid','admin_app'),
    (linked_request,linked_request::text,parent,'Local',branch,1000,'[]','pending','admin_app');
  insert into public.academy_bills(id,branch_id,student_id,bill_month,amount_due,original_amount,payment_request_id)
    values(bill,branch,student,to_char(current_date,'YYYY-MM'),1000,1000,linked_request);
  insert into public.academy_counsel_logs(id,branch_id,student_id,content)
    values(private_counsel,branch,student,'Local private'),(other_counsel,other_branch,other_student,'Local other');
  insert into public.academy_study_logs(id,branch_id,student_id,class_name,title,content,is_parent_visible)
    values(internal_study,branch,student,'Local','Private','Local internal',false),
          (public_study,branch,student,'Local','Public','Local published',true);

  if has_table_privilege('anon','public.academy_counsel_logs','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon','public.academy_study_logs','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.academy_students','DELETE')
  then raise exception 'Unexpected direct table grants'; end if;

  perform set_config('request.jwt.claim.sub',parent::text,true);
  set local role authenticated;
  if exists (select 1 from public.academy_counsel_logs where id=private_counsel)
    or exists (select 1 from public.academy_study_logs where id in (internal_study,public_study))
    or exists (select 1 from public.parent_journal_entries where source_id in (internal_study,private_counsel))
    or not exists (select 1 from public.parent_journal_entries where source_id=public_study)
  then raise exception 'Parent journal visibility mismatch'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub',director::text,true);
  set local role authenticated;
  if not exists (select 1 from public.academy_counsel_logs where id=private_counsel)
    or exists (select 1 from public.academy_counsel_logs where id=other_counsel)
  then raise exception 'Director branch visibility mismatch'; end if;
  begin
    insert into public.academy_counsel_logs(branch_id,student_id,content) values(branch,other_student,'Mismatched branch');
    raise exception 'Cross-branch journal insert allowed';
  exception when insufficient_privilege then null; end;

  begin
    perform public.delete_unpaid_app_payment_request(remote_request,'Local test');
    raise exception 'Cross-branch bill deletion allowed';
  exception when raise_exception then if sqlerrm <> '[PERMISSION_DENIED]' then raise; end if; end;
  begin
    perform public.delete_unpaid_app_payment_request(web_request,'Local test');
    raise exception 'Non-app request deletion allowed';
  exception when raise_exception then if sqlerrm <> '[CONFLICT_ERROR]' then raise; end if; end;
  begin
    perform public.delete_unpaid_app_payment_request(paid_request,'Local test');
    raise exception 'Paid request deletion allowed';
  exception when raise_exception then if sqlerrm <> '[BILL_PAYMENT_EXISTS]' then raise; end if; end;
  begin
    perform public.delete_unpaid_app_payment_request(linked_request,'Local test');
    raise exception 'Linked request deletion allowed';
  exception when raise_exception then if sqlerrm <> '[CONFLICT_ERROR]' then raise; end if; end;
  result := public.delete_unpaid_app_payment_request(local_request,'Local test');
  if result->>'request_id' is distinct from local_request::text then raise exception 'Same-branch delete failed'; end if;
  begin
    perform public.archive_academy_student(other_student,null,'Local test');
    raise exception 'Cross-branch archive allowed';
  exception when raise_exception then if sqlerrm <> '[PERMISSION_DENIED]' then raise; end if; end;
  result := public.archive_academy_student(student,null,'Local test');
  if result->>'status' is distinct from 'archived' then raise exception 'Student archival failed'; end if;
  result := public.archive_academy_student(null,child,'Local repeat');
  if result->>'status' is distinct from 'already_archived' then raise exception 'Repeated archive failed'; end if;
  reset role;

  begin
    insert into public.academy_bills(branch_id,student_id,bill_month,amount_due,original_amount)
      values(branch,student,to_char(current_date,'YYYY-MM'),1000,1000);
    raise exception 'Created new invoice for archived student';
  exception when raise_exception then if sqlerrm <> '[BILL_STUDENT_INVALID]' then raise; end if; end;
  update public.academy_bills set memo='Existing invoice remains editable' where id=bill;
  if not exists(select 1 from public.academy_students where id=student and archived_at is not null)
    or not exists(select 1 from public.children where id=child and deleted_at is not null)
    or not exists(select 1 from public.academy_bills where id=bill and student_id=student)
    or not exists(select 1 from public.academy_counsel_logs where id=private_counsel and student_id=student)
    or not exists(select 1 from public.academy_study_logs where id=public_study and student_id=student)
    or (select count(*) from public.user_withdrawals where child_id=child and event_type='academy_withdrawal') <> 1
    or not exists(select 1 from public.reservations where id=future_reservation and deleted_at is not null)
    or not exists(select 1 from public.reservations where id=past_reservation and deleted_at is null)
    or not exists(select 1 from public.user_packages where id=lesson_pass and status='inactive')
    or not exists(select 1 from public.academy_billing_automation_targets where student_id=student and not is_enabled)
    or exists(select 1 from public.payment_requests where id=local_request)
    or (select count(*) from public.payment_requests where id in (remote_request,web_request,paid_request,linked_request)) <> 4
  then raise exception 'Core safety invariants failed'; end if;
  raise notice 'Journal permissions, app bill deletion and student archival passed';
end
$fixture$;
