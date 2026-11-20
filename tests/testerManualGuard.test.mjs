import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guardTesterManualAttendance} from '../scripts/tester-manual-attendance.mjs';
import {testerRpcRules,patchTesterRpc} from '../scripts/tester-rpc-rules.mjs';
const migration=readFileSync(new URL('../supabase/migrations/202611170002_register_manual_ledger_attendance.sql',import.meta.url),'utf8');
test('newly installed manual RPC is guarded before its early already-registered return',()=>{
  const sql=guardTesterManualAttendance(migration);
  assert.doesNotMatch(sql,/\bcommit\s*;|\brollback\s*;/i);
  assert.match(sql,/is_tester_actor\(\) then/);
  assert.ok(sql.indexOf("core_scope()='' then")<sql.indexOf("'already_registered'"));
  assert.match(sql,/from public, anon/);
  assert.equal(sql,guardTesterManualAttendance(migration.replaceAll('\r\n','\n').replaceAll('\n','\r\n')));
  assert.throws(()=>guardTesterManualAttendance(migration.replace('commit;','commit;\ncommit;')),/MIGRATION_INVALID/);
});
test('cancel definer retains old rules but gains the same server-controlled tester gate',()=>{
  const rule=testerRpcRules.get('cancel_attendance_ledger_entry(uuid,date,uuid,uuid,timestamp with time zone)');
  assert.notEqual(rule,undefined);
  const original='CREATE FUNCTION synthetic() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$\nbegin\nperform original_action();\nend $$';
  const patched=patchTesterRpc(original,rule);
  assert.match(patched,/core_scope\(\)='' then raise exception/);
  assert.match(patched,/perform original_action\(\)/);
  const runner=readFileSync(new URL('../scripts/check-tester-local-browser.mjs',import.meta.url),'utf8');
  for(const label of ['tester_active_attendance_cancel_register_allowed','tester_attendance_revocation_keeps_cached_jwt_claim',
    'tester_revoked_attendance_register_denied','tester_revoked_attendance_cancel_denied',
    'tester_suspended_attendance_register_denied','tester_suspended_attendance_cancel_denied'])assert.ok(runner.includes(label));
});
