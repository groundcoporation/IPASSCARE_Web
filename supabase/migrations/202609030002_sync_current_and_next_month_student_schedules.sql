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
  v_current_result jsonb;
  v_next_result jsonb := null;
  v_next_month date := (date_trunc('month', (now() at time zone 'Asia/Seoul')) + interval '1 month')::date;
begin
  v_current_result := public.sync_current_month_student_schedules(
    p_student_id,
    p_schedule_ids
  );

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
