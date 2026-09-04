begin;

-- Reservation generation is additive. An existing dated reservation may have
-- been cancelled, soft-deleted, moved, or manually corrected by staff. Never
-- overwrite that operational decision during a schedule sync or cron refill.
create or replace function public.generate_upcoming_assigned_reservations(
  p_user_id uuid default null,
  p_days integer default 31
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is not null and not exists (
    select 1
    from public.users staff
    where staff.id = auth.uid()
      and staff.role in ('admin', 'coach')
  ) then
    raise exception '예약 생성 권한이 없습니다.';
  end if;

  with generated as (
    insert into public.reservations (
      branch_id, user_id, child_id, child_name, schedule_id,
      package_id, assignment_id, class_date, status,
      attendance_status, created_at
    )
    select
      assignment.branch_id,
      assignment.user_id,
      assignment.child_id,
      child.child_name,
      assignment.schedule_id,
      lesson_package.id,
      assignment.id,
      class_day::date,
      'pending',
      'yet',
      now()
    from public.student_schedule_assignments assignment
    join public.class_schedules schedule
      on schedule.id = assignment.schedule_id
     and schedule.is_active = true
     and schedule.branch_id is not distinct from assignment.branch_id
    left join public.children child
      on child.id = assignment.child_id
     and child.parent_id = assignment.user_id
     and child.deleted_at is null
    left join lateral (
      select package.id
      from public.user_packages package
      where package.user_id = assignment.user_id
        and package.child_id is not distinct from assignment.child_id
        and package.branch_id is not distinct from assignment.branch_id
        and package.status = 'active'
        and coalesce(package.voucher_type, 'lesson') = 'lesson'
        and (package.expiry_date is null or package.expiry_date::date >= v_today)
      order by package.expiry_date nulls last, package.created_at
      limit 1
    ) lesson_package on true
    cross join lateral generate_series(
      greatest(v_today, assignment.starts_on),
      least(
        (date_trunc('month', v_today) + interval '1 month - 1 day')::date,
        coalesce(
          assignment.ends_on,
          (date_trunc('month', v_today) + interval '1 month - 1 day')::date
        )
      ),
      interval '1 day'
    ) class_day
    where assignment.is_active = true
      and (p_user_id is null or assignment.user_id = p_user_id)
      and child.id is not null
      and case extract(isodow from class_day)
        when 1 then '월' when 2 then '화' when 3 then '수'
        when 4 then '목' when 5 then '금' when 6 then '토'
        when 7 then '일'
      end = schedule.day_of_week
    on conflict (assignment_id, class_date)
      where assignment_id is not null
    do nothing
    returning id
  )
  select count(*) into v_inserted from generated;

  return v_inserted;
end;
$$;

-- student_schedule_assignments is the durable weekly timetable, while
-- reservations is the dated operational roster used by the admin and driver
-- dashboards. Refill the current month's dated rows after every month change.
--
-- generate_upcoming_assigned_reservations deliberately stops at the current
-- month end. That boundary keeps future snapshots created by
-- sync_future_month_student_schedules isolated from the current-month refill.
create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'ensure-current-month-assigned-reservations'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  -- pg_cron uses UTC. 15:05 UTC is 00:05 in Asia/Seoul.
  perform cron.schedule(
    'ensure-current-month-assigned-reservations',
    '5 15 * * *',
    $job$select public.generate_upcoming_assigned_reservations(null, 31);$job$
  );
end;
$$;

-- Repair the current month immediately when this migration is deployed.
select public.generate_upcoming_assigned_reservations(null, 31);

commit;
