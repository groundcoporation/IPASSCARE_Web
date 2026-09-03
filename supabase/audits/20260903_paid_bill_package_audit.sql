-- Standalone, read-only audit: paid bill without an issued app package.
-- Run this file by itself. It intentionally avoids monthly date calculations
-- while validating the fundamental bill -> child -> package-option link.
select
  '결제 완료 청구서인데 동일 옵션 이용권 지급 이력 없음' as issue,
  'high' as severity,
  b.id as bill_id,
  b.bill_month,
  b.status as bill_status,
  b.student_id,
  s.student_name,
  s.child_id,
  b.package_option_id
from public.academy_bills as b
inner join public.academy_students as s
  on s.id = b.student_id
where b.status in ('paid', 'completed')
  and b.package_option_id is not null
  and s.child_id is not null
  and not exists (
    select 1
    from public.user_packages as p
    where p.child_id = s.child_id
      and p.option_id = b.package_option_id
  )
order by b.bill_month, s.student_name;
