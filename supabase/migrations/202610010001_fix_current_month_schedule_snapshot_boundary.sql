begin;

-- A current-month save may run more than once on the same day.  Before this
-- fix, any later assignment in the *same* month was treated as a future-month
-- snapshot.  That capped the replacement assignment at the preceding day
-- (for example, 10/01 when a stale 10/02 row existed) and could leave the
-- remaining dated reservations absent.
create or replace function public.sync_current_month_child_schedule(
  p_user_id uuid,
  p_child_id uuid,
  p_schedule_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.users%rowtype;
  v_child public.children%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_month_end date := (
    date_trunc('month', (now() at time zone 'Asia/Seoul'))
    + interval '1 month - 1 day'
  )::date;
  v_next_month_start date := (
    date_trunc('month', (now() at time zone 'Asia/Seoul'))
    + interval '1 month'
  )::date;
  v_effective date := v_today;
  v_next_start date;
  v_schedule_id uuid;
  v_generated integer := 0;
begin
  select * into v_member
  from public.users
  where id = p_user_id
  for update;

  select * into v_child
  from public.children
  where id = p_child_id
    and parent_id = p_user_id
    and deleted_at is null
  for update;

  if v_member.id is null or v_child.id is null then
    raise exception '회원과 연결된 활성 자녀를 찾을 수 없습니다.';
  end if;
  if auth.uid() is not null and not public.can_manage_branch(v_member.branch_id) then
    raise exception '해당 지점의 수업을 변경할 권한이 없습니다.';
  end if;
  if v_child.branch_id is distinct from v_member.branch_id then
    raise exception '자녀와 학부모 지점이 일치하지 않습니다.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_schedule_ids, '{}'::uuid[])) x(id)
    group by id
    having count(*) > 1
  ) then
    raise exception '동일한 수업이 중복 선택되었습니다.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_schedule_ids, '{}'::uuid[])) x(id)
    left join public.class_schedules cs on cs.id = x.id
    where cs.id is null
      or cs.is_active is not true
      or cs.branch_id is distinct from v_member.branch_id
  ) then
    raise exception '현재 지점의 활성 시간표가 아닌 항목이 포함되어 있습니다.';
  end if;

  -- A class already processed today must remain immutable; replacement starts
  -- tomorrow in that case.
  if exists (
    select 1
    from public.reservations r
    join public.student_schedule_assignments a on a.id = r.assignment_id
    where a.user_id = p_user_id
      and a.child_id = p_child_id
      and a.is_active is true
      and a.starts_on <= v_today
      and (a.ends_on is null or a.ends_on >= v_today)
      and r.class_date = v_today
      and coalesce(r.attendance_status, 'yet') not in ('yet', '확인전')
  ) then
    v_effective := v_today + 1;
  end if;

  if v_effective > v_month_end then
    return jsonb_build_object(
      'success', true,
      'effective_from', v_effective,
      'generated_count', 0
    );
  end if;

  -- Only a snapshot beginning next month (or later) bounds the current
  -- replacement.  Rows later in this month are stale current-month fragments,
  -- not future snapshots.
  select min(a.starts_on) into v_next_start
  from public.student_schedule_assignments a
  where a.user_id = p_user_id
    and a.child_id = p_child_id
    and a.is_active is true
    and a.starts_on >= v_next_month_start;

  -- Unprocessed reservations from the replacement window are recreated below.
  delete from public.reservations r
  using public.student_schedule_assignments a
  where r.assignment_id = a.id
    and a.user_id = p_user_id
    and a.child_id = p_child_id
    and a.is_active is true
    and a.starts_on <= v_month_end
    and (a.ends_on is null or a.ends_on >= v_effective)
    and r.class_date between v_effective and v_month_end
    and coalesce(r.attendance_status, 'yet') in ('yet', '확인전');

  -- Close the portion that is already effective, preserving a processed class
  -- earlier today.  All not-yet-effective rows in this month are replaced.
  update public.student_schedule_assignments a
  set ends_on = v_effective - 1,
      updated_at = now()
  where a.user_id = p_user_id
    and a.child_id = p_child_id
    and a.is_active is true
    and a.starts_on < v_effective
    and (a.ends_on is null or a.ends_on >= v_effective);

  delete from public.student_schedule_assignments a
  where a.user_id = p_user_id
    and a.child_id = p_child_id
    and a.is_active is true
    and a.starts_on between v_effective and v_month_end;

  for v_schedule_id in
    select id from unnest(coalesce(p_schedule_ids, '{}'::uuid[])) x(id)
  loop
    insert into public.student_schedule_assignments (
      user_id, child_id, branch_id, schedule_id,
      starts_on, ends_on, is_active, created_by
    ) values (
      p_user_id,
      p_child_id,
      v_member.branch_id,
      v_schedule_id,
      v_effective,
      case when v_next_start is null then null else v_next_start - 1 end,
      true,
      auth.uid()
    );
  end loop;

  with generated as (
    insert into public.reservations (
      branch_id, user_id, child_id, child_name, schedule_id,
      package_id, assignment_id, class_date, status,
      attendance_status, created_at
    )
    select
      a.branch_id,
      a.user_id,
      a.child_id,
      v_child.child_name,
      a.schedule_id,
      null,
      a.id,
      d::date,
      'pending',
      'yet',
      now()
    from public.student_schedule_assignments a
    join public.class_schedules cs
      on cs.id = a.schedule_id
     and cs.is_active is true
    cross join lateral generate_series(v_effective, v_month_end, interval '1 day') d
    where a.user_id = p_user_id
      and a.child_id = p_child_id
      and a.is_active is true
      and a.starts_on <= d::date
      and (a.ends_on is null or a.ends_on >= d::date)
      and case extract(isodow from d)
        when 1 then '월' when 2 then '화' when 3 then '수'
        when 4 then '목' when 5 then '금' when 6 then '토'
        when 7 then '일'
      end = cs.day_of_week
    on conflict (assignment_id, class_date)
      where assignment_id is not null
    do update set
      status = case
        when coalesce(reservations.attendance_status, 'yet') in ('yet', '확인전')
          then 'pending'
        else reservations.status
      end
    returning id
  )
  select count(*) into v_generated from generated;

  return jsonb_build_object(
    'success', true,
    'effective_from', v_effective,
    'generated_count', v_generated
  );
end;
$$;

revoke all on function public.sync_current_month_child_schedule(uuid, uuid, uuid[])
  from public, anon;
grant execute on function public.sync_current_month_child_schedule(uuid, uuid, uuid[])
  to authenticated;

commit;
