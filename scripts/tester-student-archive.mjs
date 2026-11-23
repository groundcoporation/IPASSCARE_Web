import {testerRpcRules,patchTesterRpc} from './tester-rpc-rules.mjs';

export function guardTesterArchiveStudent(migration) {
  const sql=migration.replaceAll('\r\n','\n').trim();
  if(!/^begin;\s/i.test(sql)||!/commit;$/i.test(sql))throw new Error('TESTER_ARCHIVE_MIGRATION_INVALID');
  const body=sql.replace(/^begin;\s*/i,'').replace(/\s*commit;$/i,'');
  if(/\bcommit\s*;|\brollback\s*;|net\.http|https?:\/\//i.test(body)
    ||(body.match(/create or replace function/gi)??[]).length!==2
    ||!body.includes('create or replace function public.archive_academy_student(')
    ||!body.includes('create or replace function public.require_active_student_for_new_bill()')
    ||!body.includes('revoke all on function public.archive_academy_student(uuid,uuid,text) from public, anon;'))
    throw new Error('TESTER_ARCHIVE_MIGRATION_INVALID');
  const rule=testerRpcRules.get('archive_academy_student(uuid,uuid,text)');
  if(rule===undefined)throw new Error('TESTER_ARCHIVE_GUARD_MISSING');
  return patchTesterRpc(body,rule);
}
