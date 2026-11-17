-- Run only in local test DB, after loading the migration in the same transaction.
do $test$
declare
  director uuid := gen_random_uuid();
  parent uuid := gen_random_uuid();
  child uuid := gen_random_uuid();
  pkg uuid := gen_random_uuid();
  reservation uuid := gen_random_uuid();
  usage uuid := gen_random_uuid();
  log_id bigint;
  branch text := 'ledger-test-' || gen_random_uuid()::text;
  other_branch text := 'ledger-test-' || gen_random_uuid()::text;
  service_day date := current_date;
  consumed timestamptz := (service_day + time '00:30') at time zone 'Asia/Seoul';
  result jsonb;
begin
  insert into public.branches(id,name) values (branch,'Local ledger test'),(other_branch,'Local other branch');
  insert into auth.users(id,email) values (director,director || '@example.invalid'),(parent,parent || '@example.invalid');
  insert into public.users(id,role,branch_id,status) values (director,'director',other_branch,'active'),(parent,'parent',branch,'active')
    on conflict (id) do update set role=excluded.role,branch_id=excluded.branch_id,status=excluded.status;
  insert into public.children(id,parent_id,child_name,branch_id) values (child,parent,'Local fixture',branch);
  insert into public.user_packages(id,user_id,child_id,branch_id,remaining_count,total_count,status,beneficiary_type)
    values (pkg,parent,child,branch,0,1,'exhausted','child');
  insert into public.reservations(id,child_id,user_id,branch_id,package_id,class_date,status,attendance_status)
    values (reservation,child,parent,branch,pkg,service_day,'pending','등원');
  insert into public.package_usage_logs(id,user_package_id,reservation_id,user_id,child_id,status,quantity,consumed_at)
    values (usage,pkg,reservation,parent,child,'consumed',1,consumed);
  insert into public.attendance_logs(child_id,branch_id,date,status,check_in,shuttle_ride_time)
    values (child,branch,service_day,'등원',consumed,consumed - interval '15 minutes') returning id into log_id;
  perform set_config('request.jwt.claim.sub',director::text,true);

  begin
    perform public.cancel_attendance_ledger_entry(child,service_day,pkg,usage,consumed);
    raise exception 'Unexpected cross-branch cancellation';
  exception when raise_exception then
    if sqlerrm <> '[PERMISSION_DENIED]' then raise; end if;
  end;
  update public.users set branch_id=branch where id=director;

  begin
    perform public.cancel_attendance_ledger_entry(child,service_day,pkg,usage,consumed - interval '1 minute');
    raise exception 'Unexpected stale cancellation';
  exception when raise_exception then
    if sqlerrm <> '[CONFLICT_ERROR]' then raise; end if;
  end;

  update public.attendance_logs set check_out=consumed + interval '1 hour' where id=log_id;
  begin
    perform public.cancel_attendance_ledger_entry(child,service_day,pkg,usage,consumed);
    raise exception 'Unexpected cancellation after checkout';
  exception when raise_exception then
    if sqlerrm <> '[DB_VALIDATION_FAILED]' then raise; end if;
  end;
  if not exists (select 1 from public.package_usage_logs where id=usage and status='consumed')
     or not exists (select 1 from public.user_packages where id=pkg and remaining_count=0) then
    raise exception 'Rejected cancellation changed usage or balance';
  end if;
  update public.attendance_logs set check_out=null where id=log_id;

  result := public.cancel_attendance_ledger_entry(child,service_day,pkg,usage,consumed);
  if result <> '{"cancelled":true,"restored":1}'::jsonb
     or not exists (select 1 from public.user_packages where id=pkg and remaining_count=1 and status='active')
     or not exists (select 1 from public.package_usage_logs where id=usage and status='held')
     or not exists (select 1 from public.reservations where id=reservation and attendance_status='yet')
     or not exists (select 1 from public.attendance_logs where id=log_id and check_in is null and shuttle_ride_time is not null) then
    raise exception 'Cancellation did not reconcile balance, hold and attendance';
  end if;

  begin
    perform public.cancel_attendance_ledger_entry(child,service_day,pkg,usage,consumed);
    raise exception 'Unexpected duplicate cancellation';
  exception when raise_exception then
    if sqlerrm <> '[CONFLICT_ERROR]' then raise; end if;
  end;
  raise notice 'Ledger cancellation checks passed';
end
$test$;
