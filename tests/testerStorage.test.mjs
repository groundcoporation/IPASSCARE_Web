import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStorageRun,storagePolicySql,storageCleanupSql,STORAGE_REF,isStorageAccessDenied} from '../scripts/tester-storage-contract.mjs';
import {readFileSync} from 'node:fs';
const run='123456abcdef',bucket=`ipass-tester-${run}`,schema=`tester_files_${run}`;
test('Storage experiment rejects production and non-owned cleanup targets',()=>{
  assert.doesNotThrow(()=>assertStorageRun(STORAGE_REF,run,bucket,schema));
  for(const args of [['wsdyrercgbvwlssntwvy',run,bucket,schema],[STORAGE_REF,run,'gallery',schema],[STORAGE_REF,run,bucket,'public'],[STORAGE_REF,'bad;',bucket,schema]])
    assert.throws(()=>assertStorageRun(...args),/TARGET_INVALID/);
  assert.throws(()=>storageCleanupSql('public',run),/TARGET_INVALID/);
});
test('Storage RLS is private, authenticated and server-scoped for all operations',()=>{
  const sql=storagePolicySql(schema,bucket);
  for(const operation of ['select','insert','update','delete']) assert.ok(sql.includes(`for ${operation} to authenticated`));
  assert.match(sql,/not b.public/);
  assert.match(sql,/raw_app_meta_data/);
  assert.match(sql,/u.status='active'/);
  assert.match(sql,/split_part\(target_path,'\/',1\)=u.branch_id/);
  assert.match(sql,/using .* with check/);
  assert.doesNotMatch(sql,/insert into storage\.|delete from storage\.|update storage\.|alter table/i);
});
test('Cleanup names only this run and does not delete metadata or cascade',()=>{
  const sql=storageCleanupSql(schema,run);
  assert.equal((sql.match(/drop policy/g)||[]).length,4);
  assert.doesNotMatch(sql,/cascade|storage\.buckets|delete from|truncate/i);
});
test('denial assertions do not accept arbitrary server or validation errors',()=>{
  for(const error of [{statusCode:'403'},{status:404},{status:400,code:'NoSuchKey'}])assert.equal(isStorageAccessDenied({error}),true);
  for(const error of [{status:500},{status:400},{status:413},{message:'permission denied'},{name:'StorageUnknownError'}])
    assert.equal(isStorageAccessDenied({error}),false);
  assert.equal(isStorageAccessDenied({data:[]}),false);
});
test('real API runner bypasses cache on downloads and cleans exact known paths',()=>{
  const source=readFileSync(new URL('../scripts/check-tester-storage.mjs',import.meta.url),'utf8');
  assert.match(source,/afterDelete=await sb.download\(other,\{cacheNonce:randomUUID\(\)\}\)/);
  assert.match(source,/remove\(\[\.\.\.paths\]\)/);
  assert.doesNotMatch(source,/\.emptyBucket\(/);
  assert.match(source,/residue\.actors/);
  assert.match(source,/AbortSignal.timeout\(20000\)/);
});
