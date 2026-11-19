-- Read-only inventory. Run against the intended Preview database, not production.
-- This is a review aid, not a pass/fail assertion or a migration.
with relations as (
  select c.relkind, c.relrowsecurity, c.oid
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
), client_relations as (
  select *,
    has_table_privilege('authenticated', oid, 'SELECT') as authenticated_read,
    has_table_privilege('anon', oid, 'SELECT') as anon_read,
    has_table_privilege('authenticated', oid, 'INSERT, UPDATE, DELETE') as authenticated_write
  from relations
)
select
  count(*) filter (where relkind in ('r', 'p') and authenticated_read and not relrowsecurity)
    as authenticated_readable_tables_without_rls,
  count(*) filter (where relkind in ('r', 'p') and anon_read and not relrowsecurity)
    as anon_readable_tables_without_rls,
  count(*) filter (where relkind in ('r', 'p') and authenticated_write and not relrowsecurity)
    as authenticated_writable_tables_without_rls,
  count(*) filter (where relkind in ('v', 'm') and (authenticated_read or anon_read))
    as client_readable_views_to_review,
  (
    select count(*)
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f' and p.prosecdef
      and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE'))
  ) as client_executable_definer_functions_to_review
from client_relations;
