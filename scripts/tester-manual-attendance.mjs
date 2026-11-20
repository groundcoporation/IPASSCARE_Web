import {testerRpcRules,patchTesterRpc} from './tester-rpc-rules.mjs';
// This temporary function is absent from the captured DB metadata, so the
// normal metadata-driven patch loop cannot protect it. Guard it at creation.
export function guardTesterManualAttendance(migration) {
  const sql=migration.replaceAll('\r\n','\n').trim();
  if(!/^begin;\s/i.test(sql)||!/commit;$/i.test(sql))throw new Error('TESTER_MANUAL_MIGRATION_INVALID');
  const body=sql.replace(/^begin;\s*/i,'').replace(/\s*commit;$/i,'');
  if(/\bcommit\s*;|\brollback\s*;|net\.http|https?:\/\//i.test(body)
    ||(body.match(/create or replace function/gi)??[]).length!==1
    ||!body.includes('function public.register_manual_ledger_attendance(')
    ||!body.includes('revoke all on function public.register_manual_ledger_attendance(uuid,date,uuid) from public, anon;'))
    throw new Error('TESTER_MANUAL_MIGRATION_INVALID');
  const rule=testerRpcRules.get('register_manual_ledger_attendance(uuid,date,uuid)');
  if(rule===undefined)throw new Error('TESTER_MANUAL_GUARD_MISSING');
  return patchTesterRpc(body.replace(/;\s*$/,''),rule);
}
