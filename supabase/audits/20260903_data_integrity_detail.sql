-- IPASSCARE detailed integrity audit (READ ONLY)
-- Prerequisite: run 20260903_data_integrity_preflight.sql first.
-- All dates use Korea time. This script does not INSERT, UPDATE, or DELETE.

-- A. Parent / child / academy-student identity and branch links.
with issues as (
  select
    case
      when c.id is null then '원생의 자녀 레코드 없음'
      when c.deleted_at is not null then '삭제된 자녀에 연결된 원생'
      when s.parent_user_id is distinct from c.parent_id then '원생·자녀 학부모 불일치'
      when s.branch_id is distinct from c.branch_id then '원생·자녀 지점 불일치'
    end as issue,
    case when c.id is null or s.parent_user_id is distinct from c.parent_id then 'critical' else 'high' end as severity,
    s.id as student_id,
    coalesce(s.student_name, c.child_name) as child_name,
    s.child_id,
    s.parent_user_id as student_parent_id,
    c.parent_id as child_parent_id,
    s.branch_id as student_branch_id,
    c.branch_id as child_branch_id
  from public.academy_students s
  left join public.children c on c.id = s.child_id
  where s.child_id is not null
    and (
      c.id is null
      or c.deleted_at is not null
      or s.parent_user_id is distinct from c.parent_id
      or s.branch_id is distinct from c.branch_id
    )

  union all

  select
    '활성 자녀인데 academy_students 연결 없음',
    'medium',
    null::uuid,
    c.child_name,
    c.id,
    null::uuid,
    c.parent_id,
    null::text,
    c.branch_id
  from public.children c
  where c.deleted_at is null
    and not exists (
      select 1 from public.academy_students s where s.child_id = c.id
    )
)
select * from issues order by severity, child_name;

-- B. Active app timetable assignments that cannot belong to the student/schedule.
select
  case
    when c.id is null then '배정 자녀 없음'
    when a.user_id is distinct from c.parent_id then '배정·자녀 학부모 불일치'
    when a.branch_id is distinct from c.branch_id then '배정·자녀 지점 불일치'
    when cs.id is null then '배정 수업시간표 없음'
    when cs.is_active is not true then '비활성 시간표 배정'
    when a.branch_id is distinct from cs.branch_id then '배정·시간표 지점 불일치'
  end as issue,
  case when c.id is null or a.user_id is distinct from c.parent_id then 'critical' else 'high' end as severity,
  a.id as assignment_id,
  a.child_id,
  c.child_name,
  a.user_id,
  a.branch_id as assignment_branch_id,
  cs.branch_id as schedule_branch_id,
  a.schedule_id,
  cs.target_class,
  a.starts_on,
  a.ends_on
from public.student_schedule_assignments a
left join public.children c on c.id = a.child_id
left join public.class_schedules cs on cs.id = a.schedule_id
where a.is_active is true
  and (
    c.id is null
    or a.user_id is distinct from c.parent_id
    or a.branch_id is distinct from c.branch_id
    or cs.id is null
    or cs.is_active is not true
    or a.branch_id is distinct from cs.branch_id
  )
order by severity, c.child_name, a.starts_on;

-- C. Overlapping active assignments for exactly the same child and timetable.
select
  '동일 수업시간표의 활성 배정 기간 중복' as issue,
  'high' as severity,
  left_a.child_id,
  c.child_name,
  left_a.schedule_id,
  cs.target_class,
  left_a.id as first_assignment_id,
  left_a.starts_on as first_starts_on,
  left_a.ends_on as first_ends_on,
  right_a.id as second_assignment_id,
  right_a.starts_on as second_starts_on,
  right_a.ends_on as second_ends_on
from public.student_schedule_assignments left_a
join public.student_schedule_assignments right_a
  on right_a.child_id = left_a.child_id
 and right_a.schedule_id = left_a.schedule_id
 and right_a.id > left_a.id
 and daterange(left_a.starts_on, coalesce(left_a.ends_on + 1, 'infinity'::date), '[)')
     && daterange(right_a.starts_on, coalesce(right_a.ends_on + 1, 'infinity'::date), '[)')
join public.children c on c.id = left_a.child_id
left join public.class_schedules cs on cs.id = left_a.schedule_id
where left_a.is_active is true
  and right_a.is_active is true
order by c.child_name, left_a.starts_on;

-- D. Monthly plan records that point across branches or to missing master data.
select
  case
    when s.id is null then '월별 계획의 원생 없음'
    when p.branch_id is distinct from s.branch_id then '월별 계획·원생 지점 불일치'
    when p.class_schedule_id is not null and cs.id is null then '월별 계획의 수업시간표 없음'
    when p.class_schedule_id is not null and p.branch_id is distinct from cs.branch_id then '월별 계획·수업시간표 지점 불일치'
  end as issue,
  case when s.id is null then 'critical' else 'high' end as severity,
  p.id as plan_id,
  p.effective_month,
  p.item_type,
  p.status,
  p.student_id,
  s.student_name,
  p.class_schedule_id,
  cs.target_class,
  p.package_option_id,
  p.branch_id as plan_branch_id,
  s.branch_id as student_branch_id,
  cs.branch_id as schedule_branch_id
from public.academy_student_monthly_plans p
left join public.academy_students s on s.id = p.student_id
left join public.class_schedules cs on cs.id = p.class_schedule_id
where s.id is null
   or p.branch_id is distinct from s.branch_id
   or (p.class_schedule_id is not null and (cs.id is null or p.branch_id is distinct from cs.branch_id))
order by severity, p.effective_month, s.student_name;

-- E. App packages: wrong ownership/branch, expired-but-active, and duplicate active grants.
with package_issues as (
  select
    case
      when c.id is null then '이용권의 자녀 레코드 없음'
      when p.user_id is distinct from c.parent_id then '이용권·자녀 학부모 불일치'
      when p.branch_id is distinct from c.branch_id then '이용권·자녀 지점 불일치'
      when p.status = 'active' and coalesce(p.valid_until, p.expiry_date)::date < (now() at time zone 'Asia/Seoul')::date then '만료일 경과 활성 이용권'
      when p.status = 'active' and p.valid_from is null and p.valid_until is null and p.expiry_date is null then '유효기간 없는 활성 이용권'
    end as issue,
    case
      when c.id is null or p.user_id is distinct from c.parent_id then 'critical'
      when p.branch_id is distinct from c.branch_id or p.status = 'active' then 'high'
      else 'medium'
    end as severity,
    p.id as package_record_id,
    p.child_id,
    c.child_name,
    p.user_id,
    c.parent_id,
    p.branch_id as package_branch_id,
    c.branch_id as child_branch_id,
    p.package_id,
    p.option_id,
    p.package_name,
    p.status,
    p.valid_from,
    p.valid_until,
    p.expiry_date,
    p.created_at
  from public.user_packages p
  left join public.children c on c.id = p.child_id
  where p.child_id is not null
    and (
      c.id is null
      or p.user_id is distinct from c.parent_id
      or p.branch_id is distinct from c.branch_id
      or (p.status = 'active' and coalesce(p.valid_until, p.expiry_date)::date < (now() at time zone 'Asia/Seoul')::date)
      or (p.status = 'active' and p.valid_from is null and p.valid_until is null and p.expiry_date is null)
    )
)
select * from package_issues order by severity, child_name, created_at desc;

select
  '동일 옵션의 활성 이용권 중복' as issue,
  'high' as severity,
  p.child_id,
  max(c.child_name) as child_name,
  p.option_id,
  array_agg(p.id order by p.created_at desc) as package_record_ids,
  count(*) as active_count,
  array_agg(p.package_name order by p.created_at desc) as package_names,
  array_agg(coalesce(p.valid_until, p.expiry_date) order by p.created_at desc) as expiry_dates
from public.user_packages p
join public.children c on c.id = p.child_id
where p.child_id is not null
  and p.status = 'active'
  and p.option_id is not null
group by p.child_id, p.option_id
having count(*) > 1
order by active_count desc, child_name;

-- F. Reservations that no longer agree with their assignment or timetable.
select
  case
    when a.id is null then '예약의 수업 배정 없음'
    when r.child_id is distinct from a.child_id then '예약·배정 자녀 불일치'
    when r.user_id is distinct from a.user_id then '예약·배정 학부모 불일치'
    when r.branch_id is distinct from a.branch_id then '예약·배정 지점 불일치'
    when r.schedule_id is distinct from a.schedule_id then '예약·배정 시간표 불일치'
    when r.class_date < a.starts_on or (a.ends_on is not null and r.class_date > a.ends_on) then '배정 유효기간 밖 예약'
  end as issue,
  'high' as severity,
  r.id as reservation_id,
  r.class_date,
  r.child_id,
  r.child_name,
  r.assignment_id,
  r.schedule_id,
  a.schedule_id as assignment_schedule_id,
  r.branch_id as reservation_branch_id,
  a.branch_id as assignment_branch_id,
  r.attendance_status,
  r.status
from public.reservations r
left join public.student_schedule_assignments a on a.id = r.assignment_id
where r.assignment_id is not null
  and (
    a.id is null
    or r.child_id is distinct from a.child_id
    or r.user_id is distinct from a.user_id
    or r.branch_id is distinct from a.branch_id
    or r.schedule_id is distinct from a.schedule_id
    or r.class_date < a.starts_on
    or (a.ends_on is not null and r.class_date > a.ends_on)
  )
order by r.class_date, r.child_name;

-- G. An `applied` monthly package plan means that billing generation handled the
-- plan; it does NOT mean an app pass was issued. The pass is issued only after
-- payment. Therefore, audit the real invariant: every applied plan must have a
-- corresponding bill for the same student/month/option.
with applied_package_plans as (
  select p.*, s.child_id, s.student_name
  from public.academy_student_monthly_plans p
  join public.academy_students s on s.id = p.student_id
  where p.item_type = 'package'
    and p.status = 'applied'
    and p.package_option_id is not null
)
select
  '적용 완료 월별 이용권 계획인데 연결된 청구서 없음' as issue,
  'high' as severity,
  plan.id as plan_id,
  plan.effective_month,
  plan.student_id,
  plan.student_name,
  plan.child_id,
  plan.package_option_id
from applied_package_plans plan
where not exists (
  select 1
  from public.academy_bills bill
  where bill.student_id = plan.student_id
    and bill.package_option_id = plan.package_option_id
    and bill.bill_month = to_char(plan.effective_month::date, 'YYYY-MM')
)
order by plan.effective_month, plan.student_name;

-- H. Paid/completed bills missing a matching child pass for their billed month.
-- This is diagnostic only; review payment status names from the preflight if
-- the installation uses a custom completed status.
with paid_bills as (
  select
    bill.id,
    bill.bill_month,
    bill.status,
    bill.student_id,
    bill.package_option_id,
    (bill.bill_month || '-01')::date as month_start,
    ((bill.bill_month || '-01')::date + interval '1 month - 1 day')::date as month_end
  from public.academy_bills bill
  where bill.status in ('paid', 'completed')
    and bill.package_option_id is not null
)
select
  '결제 완료 청구서인데 해당 월 이용권 지급 이력 없음' as issue,
  'high' as severity,
  bill.id as bill_id,
  bill.bill_month,
  bill.status as bill_status,
  bill.student_id,
  student.student_name,
  student.child_id,
  bill.package_option_id
from paid_bills bill
join public.academy_students student on student.id = bill.student_id
where student.child_id is not null
  and not exists (
    select 1
    from public.user_packages pkg
    where pkg.child_id = student.child_id
      and pkg.option_id = bill.package_option_id
      and pkg.status in ('active', 'expired', 'exhausted')
      and (pkg.valid_from is null or pkg.valid_from::date <= bill.month_end)
      and (
        (pkg.valid_until is null and pkg.expiry_date is null and pkg.status = 'active')
        or coalesce(pkg.valid_until, pkg.expiry_date)::date >= bill.month_start
      )
  )
order by bill.bill_month, student.student_name;
