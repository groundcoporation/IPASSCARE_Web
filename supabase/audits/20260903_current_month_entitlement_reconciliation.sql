-- Current-month app entitlement / billing-plan reconciliation (read-only)
-- September 2026 기준. 테스트계정(자녀1, 자녀123) 계열은 제외한다.
--
-- Interpretation:
--   * APPLIED_PLAN_WITHOUT_ACTIVE_PASS: '갱신 완료'로 기록됐지만 앱에 해당 이용권이 없음
--   * ACTIVE_PASS_WITHOUT_MONTHLY_PLAN: 앱 이용권은 있으나 해당 월 수납 계획이 없음
--   * PLANNED_PLAN_ALREADY_HAS_PASS: 앱 이용권은 있는데 계획이 아직 planned라 중복 청구 위험
--   * PLANNED_OPTION_DIFFERS_FROM_CURRENT_PASS: 현재 이용권과 다음 청구 예정 옵션이 다름
--     (수업/이용권 변경 직후에는 정상일 수 있으므로 확인 대상으로만 표시)

with params as (
  select date '2026-09-01' as month_start,
         (date '2026-09-01' + interval '1 month - 1 day')::date as month_end
), students as (
  select
    s.id as student_id,
    s.student_name,
    s.child_id,
    s.parent_user_id,
    s.branch_id
  from public.academy_students s
  where s.parent_user_id <> '48ee8543-ca61-4047-87c1-19543ead08b6'::uuid
    and s.student_name not like '자녀%'
), monthly_package_plans as (
  select
    s.student_id,
    s.student_name,
    s.child_id,
    s.parent_user_id,
    p.id as plan_id,
    p.status as plan_status,
    p.package_option_id as option_id,
    coalesce(pkg.name || ' - ', '') || coalesce(po.label, p.package_option_id::text) as item_name,
    po.price as plan_price
  from students s
  join public.academy_student_monthly_plans p
    on p.student_id = s.student_id
  left join public.package_options po on po.id = p.package_option_id
  left join public.packages pkg on pkg.id = po.package_id
  cross join params x
  where p.effective_month = x.month_start
    and p.item_type = 'package'
    and p.package_option_id is not null
    and p.status in ('planned', 'applied')
), current_app_passes as (
  select
    s.student_id,
    s.student_name,
    up.id as user_package_id,
    up.child_id as pass_child_id,
    up.user_id as pass_user_id,
    up.option_id,
    up.package_name,
    up.status as pass_status,
    up.price as pass_price,
    up.created_at,
    up.valid_from,
    up.valid_until,
    up.expiry_date,
    case when up.child_id is null then 'shared/family' else 'child' end as pass_owner
  from students s
  join public.user_packages up
    on (up.child_id = s.child_id
        or (up.child_id is null and up.user_id = s.parent_user_id))
  cross join params x
  where up.status = 'active'
    and (up.valid_from is null or up.valid_from::date <= x.month_end)
    and coalesce(up.valid_until::date, up.expiry_date::date, 'infinity'::date) >= x.month_start
), issues as (
  select
    'APPLIED_PLAN_WITHOUT_ACTIVE_PASS'::text as issue,
    'high'::text as severity,
    p.student_id, p.student_name, p.child_id,
    p.plan_id, p.plan_status, p.option_id,
    p.item_name as plan_item, p.plan_price,
    null::uuid as user_package_id, null::text as pass_owner,
    null::text as pass_item, null::numeric as pass_price,
    '수납 계획은 applied인데 9월에 유효한 동일 옵션의 앱 이용권이 없습니다.'::text as detail
  from monthly_package_plans p
  where p.plan_status = 'applied'
    and not exists (
      select 1 from current_app_passes up
      where up.student_id = p.student_id and up.option_id = p.option_id
    )

  union all

  select
    'ACTIVE_PASS_WITHOUT_MONTHLY_PLAN', 'medium',
    up.student_id, up.student_name, s.child_id,
    null::uuid, null::text, up.option_id,
    null::text, null::numeric,
    up.user_package_id, up.pass_owner,
    up.package_name, up.pass_price,
    '앱의 9월 유효 이용권에 대응하는 9월 수납 계획이 없습니다.'
  from current_app_passes up
  join students s on s.student_id = up.student_id
  where not exists (
    select 1 from monthly_package_plans p
    where p.student_id = up.student_id and p.option_id = up.option_id
  )

  union all

  select
    'PLANNED_PLAN_ALREADY_HAS_PASS', 'medium',
    p.student_id, p.student_name, p.child_id,
    p.plan_id, p.plan_status, p.option_id,
    p.item_name, p.plan_price,
    up.user_package_id, up.pass_owner,
    up.package_name, up.pass_price,
    '동일 옵션의 앱 이용권이 유효하지만 수납 계획 상태가 planned입니다. 중복 청구/표시를 확인하세요.'
  from monthly_package_plans p
  join current_app_passes up
    on up.student_id = p.student_id and up.option_id = p.option_id
  where p.plan_status = 'planned'

  union all

  select
    'PLANNED_OPTION_DIFFERS_FROM_CURRENT_PASS', 'info',
    p.student_id, p.student_name, p.child_id,
    p.plan_id, p.plan_status, p.option_id,
    p.item_name, p.plan_price,
    up.user_package_id, up.pass_owner,
    up.package_name, up.pass_price,
    '현재 앱 이용권과 청구 예정 옵션이 다릅니다. 수업/이용권 변경 직후라면 정상입니다.'
  from monthly_package_plans p
  join current_app_passes up on up.student_id = p.student_id
  where p.plan_status = 'planned'
    and p.option_id <> up.option_id
    and not exists (
      select 1 from current_app_passes same_option
      where same_option.student_id = p.student_id and same_option.option_id = p.option_id
    )
)
select *
from issues
order by
  case severity when 'high' then 1 when 'medium' then 2 else 3 end,
  student_name,
  issue,
  plan_item nulls last,
  pass_item nulls last;
