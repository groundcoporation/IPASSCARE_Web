begin;

-- One-time September 2026 reconciliation.
-- The source of truth for this repair is an active app entitlement valid in
-- September. Existing issued bills are never rewritten by this migration.
-- Test children ("자녀%") are deliberately excluded.
create temporary table _sept_active_entitlements on commit drop as
with active_students as (
  select s.id as student_id, s.child_id, s.parent_user_id, s.branch_id
  from public.academy_students s
  join public.children c on c.id = s.child_id and c.deleted_at is null
  left join public.users parent on parent.id = s.parent_user_id
  where (parent.status is null or parent.status <> 'deleted')
    and coalesce(s.student_name, '') not like '자녀%'
), active_child_passes as (
  select s.student_id, s.branch_id, up.option_id
  from active_students s
  join public.user_packages up on up.child_id = s.child_id
  where up.status = 'active'
    and up.option_id is not null
    and coalesce(up.voucher_type, 'lesson') <> 'gps'
    and (up.valid_from is null or up.valid_from::date <= date '2026-09-30')
    and coalesce(up.valid_until::date, up.expiry_date::date, 'infinity'::date) >= date '2026-09-01'
), active_shared_shuttle_passes as (
  -- A parent-owned shuttle pass is family-shared. It must be represented by
  -- one stable student only, never copied into every sibling's plan.
  select distinct on (up.id) s.student_id, s.branch_id, up.option_id
  from active_students s
  join public.user_packages up
    on up.child_id is null
   and up.user_id = s.parent_user_id
  where up.status = 'active'
    and up.option_id is not null
    and up.voucher_type = 'shuttle'
    and (up.valid_from is null or up.valid_from::date <= date '2026-09-30')
    and coalesce(up.valid_until::date, up.expiry_date::date, 'infinity'::date) >= date '2026-09-01'
  order by up.id, s.student_id
)
select distinct student_id, branch_id, option_id
from (
  select * from active_child_passes
  union all
  select * from active_shared_shuttle_passes
) entitlements;

-- 1. An active pass and an identical draft plan describe the same September
-- item. Mark it applied so it cannot later be billed a second time.
update public.academy_student_monthly_plans plan
set status = 'applied'
from _sept_active_entitlements entitlement
where plan.student_id = entitlement.student_id
  and plan.effective_month = date '2026-09-01'
  and plan.item_type = 'package'
  and coalesce(plan.billing_source, 'standard') = 'standard'
  and plan.status = 'planned'
  and plan.package_option_id = entitlement.option_id;

-- 2. Replace only an unbilled, standard draft when there is exactly one
-- active entitlement of the same voucher type and exactly one stale draft of
-- that type. This fixes option swaps such as 최지훈 without touching issued
-- invoices or additional charges.
with unmatched_entitlements as (
  select entitlement.student_id, entitlement.option_id, package.voucher_type,
         row_number() over (partition by entitlement.student_id, package.voucher_type order by entitlement.option_id) as row_no,
         count(*) over (partition by entitlement.student_id, package.voucher_type) as item_count
  from _sept_active_entitlements entitlement
  join public.package_options option on option.id = entitlement.option_id
  join public.packages package on package.id = option.package_id
  where not exists (
    select 1
    from public.academy_student_monthly_plans matching_plan
    where matching_plan.student_id = entitlement.student_id
      and matching_plan.effective_month = date '2026-09-01'
      and matching_plan.item_type = 'package'
      and matching_plan.package_option_id = entitlement.option_id
  )
), replaceable_plans as (
  select plan.id, plan.student_id, package.voucher_type,
         row_number() over (partition by plan.student_id, package.voucher_type order by plan.created_at, plan.id) as row_no,
         count(*) over (partition by plan.student_id, package.voucher_type) as item_count
  from public.academy_student_monthly_plans plan
  join public.package_options option on option.id = plan.package_option_id
  join public.packages package on package.id = option.package_id
  where plan.effective_month = date '2026-09-01'
    and plan.item_type = 'package'
    and plan.status = 'planned'
    and coalesce(plan.billing_source, 'standard') = 'standard'
    and not exists (
      select 1
      from public.academy_bills bill
      where bill.student_id = plan.student_id
        and bill.package_option_id = plan.package_option_id
        and bill.bill_month in ('2026-09', '2026-09-01')
        and coalesce(bill.status, 'unpaid') not in ('cancelled', 'void', 'deleted')
    )
    and not exists (
      select 1
      from _sept_active_entitlements entitlement
      where entitlement.student_id = plan.student_id
        and entitlement.option_id = plan.package_option_id
    )
)
update public.academy_student_monthly_plans plan
set package_option_id = entitlement.option_id,
    status = 'applied'
from replaceable_plans stale
join unmatched_entitlements entitlement
  on entitlement.student_id = stale.student_id
 and entitlement.voucher_type = stale.voucher_type
 and entitlement.row_no = stale.row_no
where plan.id = stale.id
  and stale.item_count = 1
  and entitlement.item_count = 1;

-- 3. An active entitlement without a plan gets an applied standard plan. The
-- creator is copied from the latest plan in the same branch; it is audit
-- metadata only and avoids impersonating a parent account.
insert into public.academy_student_monthly_plans (
  student_id, branch_id, effective_month, item_type, package_option_id,
  billing_cycle, payment_day, status, billing_source, created_by
)
select entitlement.student_id,
       entitlement.branch_id,
       date '2026-09-01',
       'package',
       entitlement.option_id,
       coalesce(class_mapping.billing_cycle, '월 기간제'),
       coalesce(class_mapping.payment_day, '매월 1일'),
       'applied',
       'standard',
       creator.created_by
from _sept_active_entitlements entitlement
left join (
  select student_id,
         package_option_id,
         max(billing_cycle) as billing_cycle,
         max(payment_day) as payment_day
  from public.academy_student_classes
  where status = 'active'
  group by student_id, package_option_id
) class_mapping
  on class_mapping.student_id = entitlement.student_id
 and class_mapping.package_option_id = entitlement.option_id
join lateral (
  select previous_plan.created_by
  from public.academy_student_monthly_plans previous_plan
  where previous_plan.branch_id = entitlement.branch_id
    and previous_plan.created_by is not null
  order by previous_plan.created_at desc
  limit 1
) creator on true
where not exists (
  select 1
  from public.academy_student_monthly_plans plan
  where plan.student_id = entitlement.student_id
    and plan.effective_month = date '2026-09-01'
    and plan.item_type = 'package'
    and plan.package_option_id = entitlement.option_id
);

commit;
