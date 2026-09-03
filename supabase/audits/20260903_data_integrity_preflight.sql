-- IPASSCARE data-integrity preflight (read-only)
-- Run this entire file in the Supabase SQL Editor and share the result sets.
-- It changes no data. The result identifies the exact schema and record counts
-- needed before running the detailed student / schedule / billing audit.

-- 1. Relevant tables currently available in the public schema.
select
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'users', 'children', 'academy_students', 'academy_student_classes',
    'academy_student_monthly_plans', 'student_schedule_assignments',
    'class_schedules', 'reservations', 'user_packages', 'academy_bills',
    'payment_requests', 'offline_payments', 'package_options', 'packages'
  )
order by table_name;

-- 2. Column inventory. This lets the detailed audit use the production schema
-- exactly (legacy installations have slightly different validity/date columns).
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'users', 'children', 'academy_students', 'academy_student_classes',
    'academy_student_monthly_plans', 'student_schedule_assignments',
    'class_schedules', 'reservations', 'user_packages', 'academy_bills',
    'payment_requests', 'offline_payments', 'package_options', 'packages'
  )
order by table_name, ordinal_position;

-- 3. Foreign-key links for the same data domain.
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as referenced_table,
  ccu.column_name as referenced_column,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.table_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
  and tc.table_name in (
    'children', 'academy_students', 'academy_student_classes',
    'academy_student_monthly_plans', 'student_schedule_assignments',
    'class_schedules', 'reservations', 'user_packages', 'academy_bills',
    'payment_requests', 'offline_payments', 'package_options', 'packages'
  )
order by tc.table_name, kcu.column_name;

-- 4. Fast row-volume snapshot. Status checks follow after the schema has been
-- confirmed, because legacy deployments do not all use the same status fields.
select 'children' as table_name, count(*) as row_count from public.children
union all select 'academy_students', count(*) from public.academy_students
union all select 'academy_student_classes', count(*) from public.academy_student_classes
union all select 'academy_student_monthly_plans', count(*) from public.academy_student_monthly_plans
union all select 'student_schedule_assignments', count(*) from public.student_schedule_assignments
union all select 'class_schedules', count(*) from public.class_schedules
union all select 'reservations', count(*) from public.reservations
union all select 'user_packages', count(*) from public.user_packages
union all select 'academy_bills', count(*) from public.academy_bills
order by table_name;
