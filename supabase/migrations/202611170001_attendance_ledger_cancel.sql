begin;

-- Exact ledger entry only. No client-side table writes or date-wide deletes.
create or replace function public.cancel_attendance_ledger_entry(
  p_child_id uuid, p_date date, p_package_id uuid, p_usage_id uuid, p_expected_consumed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.users%rowtype;
  v_branch text;
  v_res public.reservations%rowtype;
  v_pkg public.user_packages%rowtype;
  v_usage public.package_usage_logs%rowtype;
  v_res_id uuid;
  v_log_id bigint;
  v_restored integer := 0;
  v_other_attendance boolean;
begin
  select * into v_actor from public.users where id = auth.uid();
  if v_actor.id is null or v_actor.role is null
     or v_actor.role not in ('admin','director','teacher','coach')
     or coalesce(v_actor.status,'active') <> 'active' then
    raise exception '[PERMISSION_DENIED]';
  end if;

  select branch_id into v_branch from public.children where id = p_child_id and deleted_at is null;
  if v_branch is null then raise exception '[ATT_CHILD_INVALID]'; end if;
  if v_actor.role <> 'admin' and v_actor.branch_id is distinct from v_branch then
    raise exception '[PERMISSION_DENIED]';
  end if;
  if p_date is null or p_package_id is null then raise exception '[INPUT_INVALID]'; end if;

  -- Match the existing check-in lock order: reservation before package.
  perform r.id from public.reservations r
    where r.child_id = p_child_id and r.branch_id = v_branch and r.class_date = p_date
    order by r.id for update;

  select * into v_pkg from public.user_packages
    where id = p_package_id and child_id = p_child_id and branch_id = v_branch
      and coalesce(voucher_type,'lesson') = 'lesson' for update;
  if not found then raise exception '[DATA_REFERENCE_ERROR]'; end if;

  if p_usage_id is not null then
    select * into v_usage from public.package_usage_logs
      where id = p_usage_id and user_package_id = v_pkg.id and child_id = p_child_id
      for update;
    if not found or v_usage.status <> 'consumed'
       or v_usage.consumed_at is distinct from p_expected_consumed_at then
      raise exception '[CONFLICT_ERROR]';
    end if;
    v_res_id := v_usage.reservation_id;
    if v_res_id is null then
      if (v_usage.consumed_at at time zone 'Asia/Seoul')::date is distinct from p_date then
        raise exception '[CONFLICT_ERROR]';
      end if;
    else
      select * into v_res from public.reservations
        where id = v_res_id and child_id = p_child_id and branch_id = v_branch
          and class_date = p_date and deleted_at is null
          and coalesce(attendance_status,'') in ('등원','출석','하원');
      if not found then raise exception '[ATT_RESERVATION_INVALID]'; end if;
    end if;
  end if;

  -- A legacy date alone must not cancel an unrelated lesson or restore guesses.
  select exists (
    select 1 from public.package_usage_logs u
    join public.user_packages p on p.id = u.user_package_id and p.branch_id = v_branch
    left join public.reservations r on r.id = u.reservation_id
    where u.child_id = p_child_id and u.status = 'consumed' and u.id is distinct from p_usage_id
      and ((r.branch_id = v_branch and r.class_date = p_date and r.deleted_at is null
            and coalesce(r.attendance_status,'') !~ '결석|보강')
        or (u.reservation_id is null and (u.consumed_at at time zone 'Asia/Seoul')::date = p_date))
  ) or exists (
    select 1 from public.reservations r
    where r.child_id = p_child_id and r.branch_id = v_branch and r.class_date = p_date
      and r.deleted_at is null and r.id is distinct from v_res_id
      and r.attendance_status in ('등원','출석','하원')
  ) into v_other_attendance;

  if p_usage_id is null and v_other_attendance then raise exception '[CONFLICT_ERROR]'; end if;
  if v_res_id is not null and exists (
    select 1 from public.package_usage_logs u
    where u.reservation_id = v_res_id and u.id <> p_usage_id and u.status = 'consumed'
  ) then raise exception '[CONFLICT_ERROR]'; end if;

  -- Keep the daily record if another lesson remains, and never erase shuttle events.
  if not v_other_attendance then
    select l.id into v_log_id from public.attendance_logs l
      where l.child_id = p_child_id and l.branch_id = v_branch and l.date = p_date
        and l.check_in is not null and coalesce(l.status,'') !~ '결석|보강'
      order by l.id limit 1 for update;
    if exists (
      select 1 from public.attendance_logs l
      where l.child_id = p_child_id and l.branch_id = v_branch and l.date = p_date
        and (l.check_out is not null or l.shuttle_drop_time is not null
          or (l.check_in is not null and l.id is distinct from v_log_id))
    ) then raise exception '[DB_VALIDATION_FAILED]'; end if;
    if v_log_id is null and p_usage_id is null then raise exception '[CONFLICT_ERROR]'; end if;
  end if;

  if p_usage_id is not null then
    if v_res.attendance_status = '하원'
       or coalesce(v_pkg.status,'') not in ('active','exhausted','expired')
       or v_usage.quantity <= 0
       or v_pkg.remaining_count + v_usage.quantity > v_pkg.total_count then
      raise exception '[DB_VALIDATION_FAILED]';
    end if;

    v_restored := v_usage.quantity;
    update public.package_usage_logs
      set status = 'released', released_at = now()
      where id = p_usage_id;
    update public.user_packages
      set remaining_count = remaining_count + v_restored,
          status = case
            when status = 'exhausted' and expiry_date is not null and expiry_date <= now() then 'expired'
            when status = 'exhausted' then 'active'
            else status end
      where id = v_pkg.id;
    if v_res_id is not null then
      -- After restoring capacity, let the existing trigger recreate a valid hold.
      update public.reservations set attendance_status = 'yet' where id = v_res_id;
    end if;
  end if;

  if v_log_id is not null then
    update public.attendance_logs
      set check_in = null,
          status = case when shuttle_ride_time is not null then '승차' else null end
      where id = v_log_id;
  end if;
  return jsonb_build_object('cancelled',true,'restored',v_restored);
end;
$$;

revoke all on function public.cancel_attendance_ledger_entry(uuid,date,uuid,uuid,timestamptz) from public, anon;
grant execute on function public.cancel_attendance_ledger_entry(uuid,date,uuid,uuid,timestamptz) to authenticated;

commit;
