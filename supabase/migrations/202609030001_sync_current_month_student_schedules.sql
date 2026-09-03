begin;

-- Keeps already processed lessons intact while replacing an app-linked student's
-- remaining current-month timetable, assignments, and unprocessed reservations.
create or replace function public.sync_current_month_student_schedules(
  p_student_id uuid,
  p_schedule_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_student public.academy_students%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;
  v_month_end date := (date_trunc('month', (now() at time zone 'Asia/Seoul')) + interval '1 month - 1 day')::date;
  v_effective_date date;
  v_previous_day date;
  v_next_snapshot_start date;
  v_new_assignment_ends_on date;
  v_schedule_id uuid;
  v_generated integer := 0;
begin
  select * into v_student
  from public.academy_students
  where id = p_student_id
  for update;

  if v_student.id is null then raise exception '학생을 찾을 수 없습니다.'; end if;
  if v_student.parent_user_id is null or v_student.child_id is null then
    raise exception '앱 회원과 연결된 자녀만 이번 달 수업을 변경할 수 있습니다.';
  end if;
  -- SQL Editor runs without a JWT. Browser/API calls still require the
  -- authenticated role (see the execute grant below) and branch permission.
  if auth.uid() is not null and not public.can_manage_branch(v_student.branch_id) then
    raise exception '해당 지점의 수업을 변경할 권한이 없습니다.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_schedule_ids, '{}'::uuid[])) id
    group by id having count(*) > 1
  ) then raise exception '동일한 수업이 중복 선택되었습니다.'; end if;
  if exists (
    select 1
    from unnest(coalesce(p_schedule_ids, '{}'::uuid[])) selected(id)
    left join public.class_schedules schedule on schedule.id = selected.id
    where schedule.id is null
       or schedule.is_active is not true
       or schedule.branch_id is distinct from v_student.branch_id
  ) then raise exception '현재 지점의 활성 시간표가 아닌 항목이 포함되어 있습니다.'; end if;

  -- If a lesson has already been processed today, leave today's snapshot intact
  -- and start the replacement tomorrow. Otherwise the new schedule is live today.
  v_effective_date := v_today;
  if exists (
    select 1
    from public.reservations reservation
    join public.student_schedule_assignments assignment on assignment.id = reservation.assignment_id
    where assignment.user_id = v_student.parent_user_id
      and assignment.child_id = v_student.child_id
      and assignment.is_active is true
      and assignment.starts_on <= v_today
      and (assignment.ends_on is null or assignment.ends_on >= v_today)
      and reservation.class_date = v_today
      and coalesce(reservation.attendance_status, 'yet') not in ('yet', '확인전')
  ) then
    v_effective_date := v_today + 1;
  end if;

  -- The billing plan remains current-month scoped, but now matches the app timetable.
  delete from public.academy_student_monthly_plans
  where student_id = p_student_id
    and effective_month = v_month_start
    and item_type = 'class'
    and status = 'planned';

  insert into public.academy_student_monthly_plans (
    student_id, branch_id, effective_month, item_type,
    class_schedule_id, package_option_id, billing_cycle,
    payment_day, status, created_by
  )
  select
    v_student.id, v_student.branch_id, v_month_start, 'class',
    selected.id, null::uuid, '월 기간제', '매월 1일', 'planned', auth.uid()
  from unnest(coalesce(p_schedule_ids, '{}'::uuid[])) selected(id);

  if v_effective_date <= v_month_end then
    v_previous_day := v_effective_date - 1;

    -- A next-month snapshot may already exist. Cap the replacement rows at
    -- its boundary so the app never sees both month snapshots as active.
    select min(assignment.starts_on) into v_next_snapshot_start
    from public.student_schedule_assignments assignment
    where assignment.user_id = v_student.parent_user_id
      and assignment.child_id = v_student.child_id
      and assignment.is_active is true
      and assignment.starts_on > v_effective_date;
    v_new_assignment_ends_on := case
      when v_next_snapshot_start is null then null
      else v_next_snapshot_start - 1
    end;

    -- Do not touch attendance that has already been recorded. All remaining
    -- reservations are recreated from the selected timetable below.
    delete from public.reservations reservation
    using public.student_schedule_assignments assignment
    where reservation.assignment_id = assignment.id
      and assignment.user_id = v_student.parent_user_id
      and assignment.child_id = v_student.child_id
      and assignment.is_active is true
      and assignment.starts_on <= v_month_end
      and (assignment.ends_on is null or assignment.ends_on >= v_effective_date)
      and reservation.class_date between v_effective_date and v_month_end
      and coalesce(reservation.attendance_status, 'yet') in ('yet', '확인전');

    update public.student_schedule_assignments assignment
    set ends_on = v_previous_day,
      updated_at = now()
    where assignment.user_id = v_student.parent_user_id
      and assignment.child_id = v_student.child_id
      and assignment.is_active is true
      and assignment.starts_on < v_effective_date
      and (assignment.ends_on is null or assignment.ends_on >= v_effective_date);

    delete from public.student_schedule_assignments assignment
    where assignment.user_id = v_student.parent_user_id
      and assignment.child_id = v_student.child_id
      and assignment.is_active is true
      and assignment.starts_on = v_effective_date;

    for v_schedule_id in
      select id from unnest(coalesce(p_schedule_ids, '{}'::uuid[])) selected(id)
    loop
      insert into public.student_schedule_assignments (
        user_id, child_id, branch_id, schedule_id,
        starts_on, ends_on, is_active, created_by
      ) values (
        v_student.parent_user_id, v_student.child_id, v_student.branch_id,
        v_schedule_id, v_effective_date, v_new_assignment_ends_on, true, auth.uid()
      );
    end loop;

    with generated as (
      insert into public.reservations (
        branch_id, user_id, child_id, child_name, schedule_id,
        package_id, assignment_id, class_date, status,
        attendance_status, created_at
      )
      select
        assignment.branch_id, assignment.user_id, assignment.child_id,
        child.child_name, assignment.schedule_id, null, assignment.id,
        class_day::date, 'pending', 'yet', now()
      from public.student_schedule_assignments assignment
      join public.class_schedules schedule
        on schedule.id = assignment.schedule_id
       and schedule.is_active is true
       and schedule.branch_id is not distinct from assignment.branch_id
      join public.children child
        on child.id = assignment.child_id
       and child.parent_id = assignment.user_id
       and child.deleted_at is null
      cross join lateral generate_series(v_effective_date, v_month_end, interval '1 day') class_day
      where assignment.user_id = v_student.parent_user_id
        and assignment.child_id = v_student.child_id
        and assignment.schedule_id = any(coalesce(p_schedule_ids, '{}'::uuid[]))
        and assignment.is_active is true
        and assignment.starts_on <= class_day::date
        and (assignment.ends_on is null or assignment.ends_on >= class_day::date)
        and case extract(isodow from class_day)
          when 1 then '월' when 2 then '화' when 3 then '수'
          when 4 then '목' when 5 then '금' when 6 then '토'
          when 7 then '일'
        end = schedule.day_of_week
      on conflict (assignment_id, class_date)
        where assignment_id is not null
      do update set
        branch_id = excluded.branch_id,
        child_id = excluded.child_id,
        child_name = excluded.child_name,
        schedule_id = excluded.schedule_id,
        status = case
          when coalesce(reservations.attendance_status, 'yet') in ('yet', '확인전') then 'pending'
          else reservations.status
        end
      returning id
    ) select count(*) into v_generated from generated;
  end if;

  return jsonb_build_object(
    'success', true,
    'student_id', p_student_id,
    'effective_from', v_effective_date,
    'schedule_count', cardinality(coalesce(p_schedule_ids, '{}'::uuid[])),
    'generated_count', v_generated
  );
end;
$$;

revoke all on function public.sync_current_month_student_schedules(uuid, uuid[])
  from public, anon;
grant execute on function public.sync_current_month_student_schedules(uuid, uuid[])
  to authenticated;

comment on function public.sync_current_month_student_schedules(uuid, uuid[])
  is 'Synchronizes an app-linked student''s remaining current-month timetable while preserving completed lessons.';

commit;
