begin;

-- Additional charges must remain separate from an already confirmed monthly
-- charge. Keep the original bill immutable and create one explicit plan row
-- for the extra package option.
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
  v_package public.packages%rowtype;
  v_month date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_month_end date := (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month - 1 day')::date;
  v_month_text text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_plan_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_actor
  from public.users
  where id = auth.uid()
    and coalesce(status, 'active') = 'active';

  if v_actor.id is null
     or v_actor.role not in ('admin', 'director', 'teacher', 'coach') then
    raise exception '추가 청구를 등록할 권한이 없습니다.';
  end if;

  select * into v_student
  from public.academy_students
  where id = p_student_id
  for update;

  if v_student.id is null or not public.can_manage_branch(v_student.branch_id) then
    raise exception '이 학생의 추가 청구를 등록할 수 없습니다.';
  end if;

  select * into v_option
  from public.package_options
  where id = p_package_option_id;

  if v_option.id is null then
    raise exception '추가 청구할 이용권을 찾을 수 없습니다.';
  end if;

  select * into v_package
  from public.packages
  where id = v_option.package_id;

  if v_package.id is null
     or coalesce(v_option.branch_id, v_package.branch_id) is distinct from v_student.branch_id
     or coalesce(v_package.voucher_type, 'lesson') = 'gps'
     or coalesce(v_option.price, 0) <= 0 then
    raise exception '이 지점에서 추가 청구할 수 없는 이용권입니다.';
  end if;

  if exists (
    select 1
    from public.academy_student_monthly_plans plan
    where plan.student_id = v_student.id
      and plan.effective_month = v_month
      and plan.item_type = 'package'
      and plan.package_option_id = v_option.id
      and plan.status in ('planned', 'applied')
  ) or exists (
    select 1
    from public.academy_bills bill
    where bill.student_id = v_student.id
      and bill.bill_month = v_month_text
      and bill.package_option_id = v_option.id
      and coalesce(bill.status, 'unpaid') not in ('cancelled', 'void', 'deleted')
  ) then
    raise exception '같은 이용권은 이번 달 기본 청구 또는 추가 청구에 이미 포함되어 있습니다.';
  end if;

  if not exists (
    select 1
    from public.academy_student_monthly_plans plan
    where plan.student_id = v_student.id
      and plan.effective_month = v_month
      and plan.item_type = 'package'
      and plan.status = 'applied'
  ) and not exists (
    select 1
    from public.academy_bills bill
    where bill.student_id = v_student.id
      and bill.bill_month = v_month_text
      and coalesce(bill.status, 'unpaid') not in ('cancelled', 'void', 'deleted')
  ) and not exists (
    select 1
    from public.user_packages owned
    where owned.status = 'active'
      and (
        owned.child_id = v_student.child_id
        or (owned.child_id is null and owned.user_id = v_student.parent_user_id)
      )
      and (owned.valid_from is null or owned.valid_from::date <= v_month_end)
      and coalesce(owned.valid_until::date, owned.expiry_date::date, 'infinity'::date) >= v_month
  ) then
    raise exception '기존 청구 또는 갱신 완료 항목이 없는 경우에는 일반 저장으로 이용권을 변경해 주세요.';
  end if;

  insert into public.academy_student_monthly_plans (
    student_id, branch_id, effective_month, item_type, package_option_id,
    billing_cycle, payment_day, status, billing_source, created_by
  ) values (
    v_student.id, v_student.branch_id, v_month, 'package', v_option.id,
    '월 기간제', '매월 1일', 'planned', 'additional', v_actor.id
  )
  returning id into v_plan_id;

  return jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'student_id', v_student.id,
    'package_option_id', v_option.id,
    'amount_due', v_option.price,
    'bill_month', v_month_text
  );
end;
$$;

-- A planned extra item may be withdrawn only before a bill or entitlement has
-- been created. This RPC is used by the billing-management delete action.
create or replace function public.delete_planned_additional_student_billing_item(
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.users%rowtype;
  v_plan public.academy_student_monthly_plans%rowtype;
  v_student public.academy_students%rowtype;
  v_bill_month text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_actor
  from public.users
  where id = auth.uid()
    and coalesce(status, 'active') = 'active';

  if v_actor.id is null
     or v_actor.role not in ('admin', 'director', 'teacher', 'coach') then
    raise exception '추가 청구를 삭제할 권한이 없습니다.';
  end if;

  select * into v_plan
  from public.academy_student_monthly_plans
  where id = p_plan_id
  for update;

  if v_plan.id is null
     or v_plan.item_type <> 'package'
     or coalesce(v_plan.billing_source, 'standard') <> 'additional' then
    raise exception '삭제할 추가 청구 항목을 찾을 수 없습니다.';
  end if;

  select * into v_student
  from public.academy_students
  where id = v_plan.student_id;

  if v_student.id is null or not public.can_manage_branch(v_plan.branch_id) then
    raise exception '이 추가 청구를 삭제할 권한이 없습니다.';
  end if;

  if v_plan.status <> 'planned' then
    raise exception '이미 청구 또는 갱신 처리된 추가 청구는 삭제할 수 없습니다.';
  end if;

  v_bill_month := to_char(v_plan.effective_month, 'YYYY-MM');

  if exists (
    select 1
    from public.academy_bills bill
    where bill.student_id = v_plan.student_id
      and bill.bill_month = v_bill_month
      and bill.package_option_id = v_plan.package_option_id
      and coalesce(bill.status, 'unpaid') not in ('cancelled', 'void', 'deleted')
  ) then
    raise exception '이미 청구서가 생성된 추가 청구는 삭제할 수 없습니다.';
  end if;

  if exists (
    select 1
    from public.user_packages owned
    where owned.option_id = v_plan.package_option_id
      and owned.status = 'active'
      and (
        owned.child_id = v_student.child_id
        or (owned.child_id is null and owned.user_id = v_student.parent_user_id)
      )
      and (owned.valid_from is null or owned.valid_from::date <= (v_plan.effective_month + interval '1 month - 1 day')::date)
      and coalesce(owned.valid_until::date, owned.expiry_date::date, 'infinity'::date) >= v_plan.effective_month
  ) then
    raise exception '이미 이용권이 지급된 추가 청구는 삭제할 수 없습니다.';
  end if;

  delete from public.academy_student_monthly_plans
  where id = v_plan.id;

  return jsonb_build_object(
    'success', true,
    'plan_id', v_plan.id,
    'student_id', v_plan.student_id,
    'package_option_id', v_plan.package_option_id,
    'bill_month', v_bill_month
  );
end;
$$;

revoke all on function public.add_current_month_student_additional_billing_plan(uuid, uuid)
  from public, anon;
grant execute on function public.add_current_month_student_additional_billing_plan(uuid, uuid)
  to authenticated;

revoke all on function public.delete_planned_additional_student_billing_item(uuid)
  from public, anon;
grant execute on function public.delete_planned_additional_student_billing_item(uuid)
  to authenticated;

comment on function public.add_current_month_student_additional_billing_plan(uuid, uuid)
  is 'Creates a separate current-month package billing instruction without changing a confirmed standard charge.';
comment on function public.delete_planned_additional_student_billing_item(uuid)
  is 'Deletes an additional package billing instruction only before billing or entitlement issuance begins.';

commit;
