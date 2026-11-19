export const STORAGE_REF='msvwhvonafmeycmcvarv';
export function isStorageAccessDenied(result) {
  if(!result.error)return false;
  const status=Number(result.error.statusCode??result.error.status);
  return [401,403,404].includes(status)
    ||['AccessDenied','NoSuchKey','NoSuchBucket','not_found'].includes(result.error.code);
}
export function assertStorageRun(ref,run,bucket,schema) {
  if(ref!==STORAGE_REF||!/^[a-f0-9]{12}$/.test(run)
    ||bucket!==`ipass-tester-${run}`||schema!==`tester_files_${run}`)
    throw new Error('TESTER_STORAGE_TARGET_INVALID');
}
export function storagePolicySql(schema,bucket) {
  const run=bucket.replace('ipass-tester-','');
  assertStorageRun(STORAGE_REF,run,bucket,schema);
  return `create schema ${schema};
revoke all on schema ${schema} from public,anon;
grant usage on schema ${schema} to authenticated;
create function ${schema}.can_access(target_bucket text,target_path text)
returns boolean language sql stable security definer set search_path='' as $policy$
  select coalesce(target_bucket='${bucket}'
    and target_path ~ '^devsmoke-[a-f0-9]{10}-[12]/[a-f0-9-]{36}\\.txt$'
    and exists(select 1 from storage.buckets b where b.id=target_bucket and not b.public)
    and exists(select 1 from auth.users a join public.users u on u.id=a.id
      where a.id=auth.uid() and u.role='director' and u.status='active'
        and a.raw_app_meta_data->'ipasscare_tester'='true'::jsonb
        and a.raw_app_meta_data->>'ipasscare_test_branch'=u.branch_id
        and split_part(target_path,'/',1)=u.branch_id),false);
$policy$;
revoke all on function ${schema}.can_access(text,text) from public,anon;
grant execute on function ${schema}.can_access(text,text) to authenticated;
create policy tester_${run}_select on storage.objects for select to authenticated
  using (${schema}.can_access(bucket_id,name));
create policy tester_${run}_insert on storage.objects for insert to authenticated
  with check (${schema}.can_access(bucket_id,name));
create policy tester_${run}_update on storage.objects for update to authenticated
  using (${schema}.can_access(bucket_id,name)) with check (${schema}.can_access(bucket_id,name));
create policy tester_${run}_delete on storage.objects for delete to authenticated
  using (${schema}.can_access(bucket_id,name));`;
}
export function storageCleanupSql(schema,run) {
  assertStorageRun(STORAGE_REF,run,`ipass-tester-${run}`,schema);
  return ['select','insert','update','delete'].map(op=>`drop policy if exists tester_${run}_${op} on storage.objects;`).join('\n')
    +`\ndrop function if exists ${schema}.can_access(text,text);\ndrop schema if exists ${schema};`;
}
