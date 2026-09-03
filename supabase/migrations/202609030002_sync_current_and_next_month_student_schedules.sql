begin;

-- Applies a current-month timetable change and, when requested, replaces the
-- next-month timetable in the same transaction. Billing/package plans remain
-- intentionally outside this operation.
create or replace function public.sync_current_and_next_month_student_schedules(
  p_student_id uuid,
  p_schedule_ids uuid[] default '{}'::uuid[],
  p_apply_next_month boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_student public.academy_students%rowtype;
  v_current_result jsonb;
  v_next_result jsonb := null;
  v_next_month date := (date_trunc('month', (now() at time zone 'Asia/Seoul')) + interval '1 month')::date;
begin
  select * into v_student from public.academy_students where id = p_student_id for update;
  if v_student.id is null or v_student.parent_user_id is null or v_student.child_id is null then
    raise exception '앱 회원과 연결된 원생을 찾을 수 없습니다.';
  end if;

  -- The actual assignment/reservation change is shared with the mobile admin.
  v_current_result := public.sync_current_month_child_schedule(
    v_student.parent_user_id, v_student.child_id, p_schedule_ids
  );

  -- Web-only billing metadata stays separate from the app timetable mutation.
  delete from public.academy_student_monthly_plans
  where student_id = p_student_id
    and effective_month = date_trunc('month', (now() at time zone 'Asia/Seoul'))::date
    and item_type = 'class'
    and status = 'planned';
  insert into public.academy_student_monthly_plans (
    student_id, branch_id, effective_month, item_type, class_schedule_id,
    package_option_id, billing_cycle, payment_day, status, created_by
  )
  select p_student_id, v_student.branch_id,
    date_trunc('month', (now() at time zone 'Asia/Seoul'))::date,
    'class', selected.id, null::uuid, '월 기간제', '매월 1일', 'planned', auth.uid()
  from unnest(coalesce(p_schedule_ids, '{}'::uuid[])) selected(id);

  if p_apply_next_month then
    v_next_result := public.sync_future_month_student_schedules(
      p_student_id,
      v_next_month,
      p_schedule_ids
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'current', v_current_result,
    'next', v_next_result,
    'applied_next_month', p_apply_next_month
  );
end;
$$;

revoke all on function public.sync_current_and_next_month_student_schedules(uuid, uuid[], boolean)
  from public, anon;
grant execute on function public.sync_current_and_next_month_student_schedules(uuid, uuid[], boolean)
  to authenticated;

comment on function public.sync_current_and_next_month_student_schedules(uuid, uuid[], boolean)
  is 'Synchronizes current app schedules and optionally replaces the next-month snapshot in one transaction.';

commit;
