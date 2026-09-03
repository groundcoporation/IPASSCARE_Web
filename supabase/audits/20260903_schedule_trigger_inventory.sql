-- READ ONLY: triggers that can affect timetable, reservations, package use,
-- invoices, or payment issuance. Run this query alone and send its result.
select
  c.relname as table_name,
  t.tgname as trigger_name,
  case when t.tgenabled = 'O' then 'enabled' else t.tgenabled::text end as enabled,
  pg_get_triggerdef(t.oid, true) as trigger_definition,
  p.oid::regprocedure::text as function_signature,
  pg_get_functiondef(p.oid) as function_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and not t.tgisinternal
  and c.relname in (
    'student_schedule_assignments', 'reservations', 'user_packages',
    'package_usage_logs', 'academy_bills', 'payments', 'payment_requests'
  )
order by c.relname, t.tgname;
