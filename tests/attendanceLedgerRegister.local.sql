-- Load after cancellation and registration migrations inside a local rollback transaction.
do $test$
declare
  director uuid := gen_random_uuid();
  parent uuid := gen_random_uuid();
  child uuid := gen_random_uuid();
  pkg uuid := gen_random_uuid();
  other_pkg uuid := gen_random_uuid();
  reservation uuid := gen_random_uuid();
  usage uuid;
  consumed timestamptz;
  branch text := 'ledger-register-' || gen_random_uuid()::text;
  other_branch text := 'ledger-register-' || gen_random_uuid()::text;
  service_day date := (now() at time zone 'Asia/Seoul')::date;
  result jsonb;
begin
  insert into public.branches(id,name) values (branch,'Local registration'),(other_branch,'Local other branch');
  insert into auth.users(id,email) values (director,director || '@example.invalid'),(parent,parent || '@example.invalid');
  insert into public.users(id,role,branch_id,status)
    values (director,'director',other_branch,'active'),(parent,'user',branch,'active')
    on conflict (id) do update set role=excluded.role,branch_id=excluded.branch_id,status=excluded.status;
  insert into public.children(id,parent_id,child_name,branch_id) values (child,parent,'Local fixture',branch);
  insert into public.user_packages(id,user_id,child_id,branch_id,remaining_count,total_count,status,beneficiary_type)
    values (pkg,parent,child,branch,1,1,'active','child'),
           (other_pkg,parent,child,branch,2,2,'active','child');
  insert into public.reservations(id,child_id,user_id,branch_id,package_id,class_date,status,attendance_status)
    values (reservation,child,parent,branch,pkg,service_day,'pending','yet');
  perform set_config('request.jwt.claim.sub',director::text,true);

  begin
    perform public.register_manual_ledger_attendance(child,service_day,pkg);
    raise exception 'Cross-branch registration allowed';
  exception when raise_exception then
    if sqlerrm <> '[PERMISSION_DENIED]' then raise; end if;
  end;
  update public.users set branch_id=branch where id=director;

  begin
    perform public.register_manual_ledger_attendance(child,service_day-1,pkg);
    raise exception 'Missing reservation accepted';
  exception when raise_exception then
    if sqlerrm <> '[ATT_RESERVATION_INVALID]' then raise; end if;
  end;
  begin
    perform public.register_manual_ledger_attendance(child,service_day+1,pkg);
    raise exception 'Future check-in accepted';
  exception when raise_exception then
    if sqlerrm <> '[INPUT_INVALID]' then raise; end if;
  end;
  begin
    perform public.register_manual_ledger_attendance(child,service_day,other_pkg);
    raise exception 'Different package was charged';
  exception when raise_exception then
    if sqlerrm <> '[CONFLICT_ERROR]' then raise; end if;
  end;
  if exists(select 1 from public.attendance_logs where child_id=child)
    or exists(select 1 from public.package_usage_logs where reservation_id=reservation and status='consumed')
    or not exists(select 1 from public.user_packages where id=pkg and remaining_count=1)
    or not exists(select 1 from public.user_packages where id=other_pkg and remaining_count=2)
  then raise exception 'Rejected registration left partial writes'; end if;

  result := public.register_manual_ledger_attendance(child,service_day,pkg);
  if result->>'status' <> 'registered' then raise exception 'Registration did not complete'; end if;
  result := public.register_manual_ledger_attendance(child,service_day,pkg);
  if result->>'status' <> 'already_registered'
    or (select count(*) from public.attendance_logs where child_id=child and check_in is not null) <> 1
    or (select count(*) from public.package_usage_logs where reservation_id=reservation and status='consumed') <> 1
    or not exists(select 1 from public.user_packages where id=pkg and remaining_count=0)
  then raise exception 'Repeated registration created a duplicate or bad balance'; end if;

  select id,consumed_at into usage,consumed from public.package_usage_logs
    where reservation_id=reservation and status='consumed';
  result := public.cancel_attendance_ledger_entry(child,service_day,pkg,usage,consumed);
  if result->>'restored' <> '1'
    or not exists(select 1 from public.user_packages where id=pkg and remaining_count=1)
    or exists(select 1 from public.attendance_logs where child_id=child and check_in is not null)
  then raise exception 'Cancel did not restore the registered pass'; end if;
  raise notice 'Manual ledger registration checks passed';
end
$test$;
