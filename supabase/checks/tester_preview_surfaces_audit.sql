-- Metadata only. Never list file names, object bodies or customer rows.
begin read only;
select json_build_object(
  'metadata_only',true,'release_approved',false,
  'storage_buckets',(select coalesce(json_agg(json_build_object('id',id,'public',public)),'[]') from storage.buckets),
  'storage_policies',(select coalesce(json_agg(json_build_object(
    'table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check)),'[]')
    from pg_policies where schemaname='storage'),
  'anonymous_definer_rpc_count',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prosecdef and p.prorettype<>'trigger'::regtype
      and has_function_privilege('anon',p.oid,'EXECUTE')),
  'authenticated_definer_rpc_count',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prosecdef and p.prorettype<>'trigger'::regtype
      and has_function_privilege('authenticated',p.oid,'EXECUTE')),
  'public_client_tables_without_rls',(select coalesce(json_agg(c.relname order by c.relname),'[]')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity
      and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT')))
) as tester_surface_report;
commit;
