import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTesterCheck, buildWriteCheck } from '../scripts/check-tester-preview.mjs';
import { TESTER_PROJECT_REF } from '../config/tester-target.mjs';
const sql = readFileSync(new URL('../supabase/checks/tester_preview_core_policy.sql', import.meta.url), 'utf8');
test('policy experiment is restricted to Develop and rollback-only SQL', () => {
  assert.doesNotThrow(() => validateTesterCheck(TESTER_PROJECT_REF, sql));
  for (const ref of ['wsdyrercgbvwlssntwvy', 'local', ''])
    assert.throws(() => validateTesterCheck(ref, sql), /TARGET_MISMATCH/);
  for (const bad of [sql.replace(/rollback;\s*$/, 'commit;'), sql.replace('TESTER_PREVIEW_SYNTHETIC_FIXTURES_REQUIRED', 'removed'),
    sql.replace('TESTER_PREVIEW_POLICY_BASELINE_CHANGED', 'removed'), sql.replace('begin;', '')])
    assert.throws(() => validateTesterCheck(TESTER_PROJECT_REF, bad), /ROLLBACK_GUARD_REQUIRED/);
});
test('write experiment pins reviewed functions and rejects external SQL before writes', () => {
  const probes = readFileSync(new URL('../supabase/checks/tester_preview_write_probes.sql', import.meta.url), 'utf8');
  const metadata = { functions: [{signature:'safe()',definition:'select true'}], triggers: [] };
  const built = buildWriteCheck(sql, probes, metadata);
  assert.doesNotThrow(() => validateTesterCheck(TESTER_PROJECT_REF, built));
  assert.match(built, /TESTER_REVIEWED_FUNCTIONS_CHANGED/);
  assert.match(built, /forged_child_attendance_denied/);
  assert.match(built, /forged_student_bill_denied/);
  assert.match(built, /required_rpc_missing/);
  assert.match(built, /security invoker set search_path = ''/);
  assert.match(built, /tester_self_role_escalation_denied/);
  assert.match(built, /tester_self_name_edit_allowed/);
  assert.ok(built.indexOf('TESTER_REVIEWED_FUNCTIONS_CHANGED') < built.indexOf('insert into public.academy_students'));
  assert.throws(() => buildWriteCheck(sql, probes, { functions: [{definition:'select net.http_post()'}],triggers:[] }), /EXTERNAL_SQL_REVIEW_REQUIRED/);
});
