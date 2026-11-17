begin;

-- Monthly ledger: check-in only, for an unambiguous existing lesson reservation.
create or replace function public.register_manual_ledger_attendance(
  p_child_id uuid, p_date date, p_package_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.users%rowtype;
  v_child public.children%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_res_ids uuid[];
  v_res_id uuid;
  v_log public.attendance_logs%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception '[AUTH_REQUIRED]'; end if;
  select * into v_actor from public.users where id = auth.uid();
  if v_actor.id is null or v_actor.role is null
    or v_actor.role not in ('admin', 'director', 'teacher', 'coach')
    or coalesce(v_actor.status, 'active') <> 'active' then
    raise exception '[PERMISSION_DENIED]';
  end if;
  if p_child_id is null or p_package_id is null or p_date is null or p_date > v_today then
    raise exception '[INPUT_INVALID]';
  end if;
  select c.* into v_child from public.children c
    join public.users p on p.id = c.parent_id
    where c.id = p_child_id and c.deleted_at is null and c.branch_id is not null
      and coalesce(p.status, 'active') = 'active';
  if not found then raise exception '[ATT_CHILD_INVALID]'; end if;
  if v_actor.role <> 'admin' and v_actor.branch_id is distinct from v_child.branch_id then
    raise exception '[PERMISSION_DENIED]';
  end if;
  if not exists (
    select 1 from public.user_packages p
    where p.id = p_package_id and p.child_id = p_child_id and p.user_id = v_child.parent_id
      and p.branch_id = v_child.branch_id and coalesce(p.voucher_type, 'lesson') = 'lesson'
  ) then raise exception '[DATA_REFERENCE_ERROR]'; end if;

  -- Match the keypad's child/date lock. Existing attendance may have been
  -- recorded elsewhere, so do not use a repeated click to take another pass.
  perform pg_advisory_xact_lock(hashtextextended(p_child_id::text || ':' || p_date::text, 0));
  select * into v_log from public.attendance_logs l
    where l.child_id = p_child_id and l.branch_id = v_child.branch_id and l.date = p_date
    order by l.id limit 1 for update;
  if exists (
    select 1 from public.attendance_logs l where l.child_id = p_child_id
      and l.branch_id = v_child.branch_id and l.date = p_date and l.id is distinct from v_log.id
  ) then raise exception '[CONFLICT_ERROR]'; end if;

  select array_agg(r.id order by r.id) into v_res_ids from (
    select id from public.reservations
    where child_id = p_child_id and user_id = v_child.parent_id and branch_id = v_child.branch_id
      and class_date = p_date and deleted_at is null and reservation_type = 'regular'
      and coalesce(status,'pending') not in ('cancelled','canceled','deleted','취소','취소요청','cancel_requested')
      and coalesce(attendance_status,'') not in ('결석','보강','하원')
    order by id for update
  ) r;
  if coalesce(cardinality(v_res_ids),0) <> 1 then raise exception '[ATT_RESERVATION_INVALID]'; end if;
  v_res_id := v_res_ids[1];

  if v_log.check_in is not null then
    if exists (select 1 from public.package_usage_logs where reservation_id = v_res_id
      and user_package_id = p_package_id and status = 'consumed') then
      return jsonb_build_object('status','already_registered');
    end if;
    raise exception '[CONFLICT_ERROR]';
  end if;
  if v_log.check_out is not null or v_log.shuttle_drop_time is not null then
    raise exception '[DB_VALIDATION_FAILED]';
  end if;

  -- Reuse the shared lesson rules. If the selected ledger row is not the pass
  -- the shared function would use, roll back instead of charging another pass.
  v_result := public.process_lesson_check_in(v_res_id,p_child_id,v_child.branch_id,p_date);
  if v_result->>'status' = 'no_available_package' then raise exception '[DB_VALIDATION_FAILED]'; end if;
  if v_result->>'status' is distinct from 'consumed'
     or v_result->>'user_package_id' is distinct from p_package_id::text then
    raise exception '[CONFLICT_ERROR]';
  end if;

  perform set_config('app.attendance_audit_source','manual',true);
  perform set_config('app.attendance_audit_reservation_id',v_res_id::text,true);
  if v_log.id is null then
    insert into public.attendance_logs(child_id,date,branch_id,status,method,check_in)
      values(p_child_id,p_date,v_child.branch_id,'등원','수동',now());
  else
    update public.attendance_logs set status='등원',method='수동',check_in=now() where id=v_log.id;
  end if;
  return jsonb_build_object('status','registered');
end;
$$;

revoke all on function public.register_manual_ledger_attendance(uuid,date,uuid) from public, anon;
grant execute on function public.register_manual_ledger_attendance(uuid,date,uuid) to authenticated;

commit;
