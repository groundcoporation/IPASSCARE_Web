-- READ ONLY: production RPC/function and trigger inventory.
-- Run each numbered query separately in the Supabase SQL Editor and share
-- the result. No application data or schema is changed.

-- 1. All public functions/RPCs: name, exact arguments, security mode, owner.
select
  p.oid::regprocedure::text as signature,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns,
  case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security_mode,
  pg_get_userbyid(p.proowner) as owner,
  obj_description(p.oid, 'pg_proc') as comment
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
order by p.proname, p.oid::regprocedure::text;

-- 2. Every enabled trigger and the function it invokes.
select
  c.relname as table_name,
  t.tgname as trigger_name,
  case t.tgtype & 2 when 2 then 'BEFORE' else 'AFTER' end as timing,
  concat_ws(', ',
    case when t.tgtype & 4 = 4 then 'INSERT' end,
    case when t.tgtype & 8 = 8 then 'DELETE' end,
    case when t.tgtype & 16 = 16 then 'UPDATE' end,
    case when t.tgtype & 32 = 32 then 'TRUNCATE' end
  ) as events,
  p.oid::regprocedure::text as trigger_function,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 3. Full source only for functions related to schedules, reservations,
-- packages, billing, or payments. These are the candidates for unification.
select
  p.oid::regprocedure::text as signature,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and (
    p.proname ilike any (array[
      '%schedule%', '%reservation%', '%package%', '%billing%', '%bill%', '%payment%', '%member%'
    ])
  )
order by p.proname, p.oid::regprocedure::text;
