begin;

-- A standard monthly plan is editable only while it is still a draft.  Once
-- the same option has been billed or issued to the app, it becomes a locked
-- record; later charges must use the explicit additional-billing path.
alter table public.academy_student_monthly_plans
  add column if not exists billing_source text not null default 'standard',
  add column if not exists origin_plan_id uuid references public.academy_student_monthly_plans(id) on delete set null;

alter table public.academy_student_monthly_plans
  drop constraint if exists academy_student_monthly_plans_billing_source_check;
alter table public.academy_student_monthly_plans
  add constraint academy_student_monthly_plans_billing_source_check
  check (billing_source in ('standard', 'additional'));

create or replace function public.save_current_month_student_billing_draft(
  p_student_id uuid,
  p_package_option_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.academy_students%rowtype;
  v_actor public.users%rowtype;
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_month_end date := (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month - 1 day')::date;
  v_requested_ids uuid[] := coalesce(p_package_option_ids, array[]::uuid[]);
  v_locked_ids uuid[] := array[]::uuid[];
  v_current_standard_ids uuid[] := array[]::uuid[];
  v_invalid_count integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_actor
  from public.users
  where id = auth.uid() and coalesce(status, 'active') = 'active';
  if v_actor.id is null or v_actor.role not in ('admin', 'director', 'teacher', 'coach') then
    raise exception '청구 예정 이용권을 저장할 권한이 없습니다.';
  end if;

  select * into v_student
  from public.academy_students
  where id = p_student_id
  for update;
  if v_student.id is null then
    raise exception '학생을 찾을 수 없습니다.';
  end if;
  if not public.can_manage_branch(v_student.branch_id) then
    raise exception '다른 지점 학생의 청구 예정 이용권은 변경할 수 없습니다.';
  end if;

  select coalesce(array_agg(distinct requested.id), array[]::uuid[])
    into v_requested_ids
  from unnest(v_requested_ids) requested(id);

  select count(*) into v_invalid_count
  from unnest(v_requested_ids) requested(id)
  left join public.package_options option on option.id = requested.id
  left join public.packages package on package.id = option.package_id
  where option.id is null
     or coalesce(option.branch_id, package.branch_id) is distinct from v_student.branch_id
     or coalesce(package.voucher_type, 'lesson') = 'gps';
  if v_invalid_count > 0 then
    raise exception '선택한 이용권 중 이 지점에서 청구할 수 없는 항목이 있습니다.';
  end if;

  -- A plan is locked by an existing bill, an already-applied plan, or an app
  -- pass valid during this month. This also repairs old rows where the pass was
  -- issued but the plan incorrectly remained planned.
  select coalesce(array_agg(distinct option_id), array[]::uuid[])
    into v_locked_ids
  from (
    select plan.package_option_id as option_id
    from public.academy_student_monthly_plans plan
    where plan.student_id = v_student.id
      and plan.effective_month = v_month
      and plan.item_type = 'package'
      and plan.package_option_id is not null
      and plan.status = 'applied'
    union
    select bill.package_option_id
    from public.academy_bills bill
    where bill.student_id = v_student.id
      and bill.bill_month = to_char(v_month, 'YYYY-MM')
      and bill.package_option_id is not null
      and coalesce(bill.status, 'unpaid') not in ('cancelled', 'void', 'deleted')
    union
    select up.option_id
    from public.user_packages up
    where up.status = 'active'
      and up.option_id is not null
      and (up.child_id = v_student.child_id
        or (up.child_id is null and up.user_id = v_student.parent_user_id))
      and (up.valid_from is null or up.valid_from::date <= v_month_end)
      and coalesce(up.valid_until::date, up.expiry_date::date, 'infinity'::date) >= v_month
  ) locked;

  select coalesce(array_agg(distinct plan.package_option_id), array[]::uuid[])
    into v_current_standard_ids
  from public.academy_student_monthly_plans plan
  where plan.student_id = v_student.id
    and plan.effective_month = v_month
    and plan.item_type = 'package'
    and plan.package_option_id is not null
    and plan.billing_source = 'standard';

  if exists (
    select 1 from unnest(v_locked_ids) locked(id)
    where not (locked.id = any(v_requested_ids))
  ) then
    raise exception '이미 청구 또는 갱신 완료된 이용권은 변경할 수 없습니다. 새 금액은 추가 청구로 등록해 주세요.';
  end if;

  if cardinality(v_locked_ids) > 0 and exists (
    select 1 from unnest(v_requested_ids) requested(id)
    where not (requested.id = any(v_current_standard_ids))
  ) then
    raise exception '확정된 이용권이 있는 달에는 새 기본 이용권을 추가할 수 없습니다. 추가 청구를 사용해 주세요.';
  end if;

  update public.academy_student_monthly_plans
  set status = 'applied'
  where student_id = v_student.id
    and effective_month = v_month
    and item_type = 'package'
    and billing_source = 'standard'
    and status = 'planned'
    and package_option_id = any(v_locked_ids);

  delete from public.academy_student_monthly_plans plan
  where plan.student_id = v_student.id
    and plan.effective_month = v_month
    and plan.item_type = 'package'
    and plan.billing_source = 'standard'
    and plan.status = 'planned';

  insert into public.academy_student_monthly_plans (
    student_id, branch_id, effective_month, item_type, package_option_id,
    billing_cycle, payment_day, status, billing_source, created_by
  )
  select v_student.id, v_student.branch_id, v_month, 'package', requested.id,
         '월 기간제', '매월 1일', 'planned', 'standard', v_actor.id
  from unnest(v_requested_ids) requested(id)
  where not exists (
    select 1 from public.academy_student_monthly_plans plan
    where plan.student_id = v_student.id
      and plan.effective_month = v_month
      and plan.item_type = 'package'
      and plan.billing_source = 'standard'
      and plan.package_option_id = requested.id
  );

  return jsonb_build_object(
    'success', true,
    'locked_option_ids', to_jsonb(v_locked_ids),
    'locked_count', cardinality(v_locked_ids)
  );
end;
$$;

create or replace function public.add_current_month_student_additional_billing_plan(
  p_student_id uuid,
  p_package_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.academy_students%rowtype;
  v_actor public.users%rowtype;
  v_option public.package_options%rowtype;
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_plan_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_actor from public.users where id = auth.uid() and coalesce(status, 'active') = 'active';
  if v_actor.id is null or v_actor.role not in ('admin', 'director', 'teacher', 'coach') then
    raise exception '추가 청구를 등록할 권한이 없습니다.';
  end if;
  select * into v_student from public.academy_students where id = p_student_id for update;
  if v_student.id is null or not public.can_manage_branch(v_student.branch_id) then
    raise exception '이 학생의 추가 청구를 등록할 수 없습니다.';
  end if;
  select * into v_option from public.package_options where id = p_package_option_id;
  if v_option.id is null or v_option.branch_id is distinct from v_student.branch_id then
    raise exception '이 지점에서 사용할 수 없는 이용권입니다.';
  end if;
  if exists (
    select 1 from public.academy_student_monthly_plans plan
    where plan.student_id = v_student.id and plan.effective_month = v_month
      and plan.item_type = 'package' and plan.package_option_id = v_option.id
  ) then
    raise exception '같은 이용권은 이번 달 기본 청구 또는 추가 청구에 이미 포함되어 있습니다.';
  end if;
  if not exists (
    select 1 from public.academy_student_monthly_plans plan
    where plan.student_id = v_student.id and plan.effective_month = v_month
      and plan.item_type = 'package' and plan.status = 'applied'
  ) and not exists (
    select 1 from public.academy_bills bill
    where bill.student_id = v_student.id and bill.bill_month = to_char(v_month, 'YYYY-MM')
  ) then
    raise exception '기존 청구 또는 갱신 완료 항목이 없는 경우에는 일반 저장으로 이용권을 변경해 주세요.';
  end if;

  insert into public.academy_student_monthly_plans (
    student_id, branch_id, effective_month, item_type, package_option_id,
    billing_cycle, payment_day, status, billing_source, created_by
  ) values (
    v_student.id, v_student.branch_id, v_month, 'package', v_option.id,
    '월 기간제', '매월 1일', 'planned', 'additional', v_actor.id
  ) returning id into v_plan_id;

  return jsonb_build_object('success', true, 'plan_id', v_plan_id);
end;
$$;

revoke all on function public.save_current_month_student_billing_draft(uuid, uuid[]) from public, anon;
revoke all on function public.add_current_month_student_additional_billing_plan(uuid, uuid) from public, anon;
grant execute on function public.save_current_month_student_billing_draft(uuid, uuid[]) to authenticated;
grant execute on function public.add_current_month_student_additional_billing_plan(uuid, uuid) to authenticated;

commit;
