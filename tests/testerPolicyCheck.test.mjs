import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTesterCheck, validateTesterAudit, buildWriteCheck, buildManualWriteCheck } from '../scripts/check-tester-preview.mjs';
import { TESTER_PROJECT_REF } from '../config/tester-target.mjs';
const sql = readFileSync(new URL('../supabase/checks/tester_preview_core_policy.sql', import.meta.url), 'utf8');
test('surface audit is metadata-only, read-only and Develop-only', () => {
  const audit = readFileSync(new URL('../supabase/checks/tester_preview_surfaces_audit.sql', import.meta.url),'utf8');
  assert.doesNotThrow(() => validateTesterAudit(TESTER_PROJECT_REF,audit));
  assert.throws(() => validateTesterAudit('wsdyrercgbvwlssntwvy',audit),/TARGET_MISMATCH/);
  assert.throws(() => validateTesterAudit(TESTER_PROJECT_REF,audit.replace('begin read only;','begin;')),/READ_ONLY_REQUIRED/);
  assert.throws(() => validateTesterAudit(TESTER_PROJECT_REF,audit.replace('commit;','delete from storage.objects; commit;')),/READ_ONLY_REQUIRED/);
  assert.doesNotMatch(audit,/from storage\.objects/i);
});
test('policy experiment is restricted to Develop and rollback-only SQL', () => {
  assert.doesNotThrow(() => validateTesterCheck(TESTER_PROJECT_REF, sql));
  for (const ref of ['wsdyrercgbvwlssntwvy', 'local', ''])
    assert.throws(() => validateTesterCheck(ref, sql), /TARGET_MISMATCH/);
  for (const bad of [sql.replace(/rollback;\s*$/, 'commit;'), sql.replace('TESTER_PREVIEW_SYNTHETIC_FIXTURES_REQUIRED', 'removed'),
    sql.replace('TESTER_PREVIEW_POLICY_BASELINE_CHANGED', 'removed'), sql.replace('begin;', '')])
    assert.throws(() => validateTesterCheck(TESTER_PROJECT_REF, bad), /ROLLBACK_GUARD_REQUIRED/);
});
test('manual RPC is injected only inside a rollback transaction, never committed', () => {
  const read = p => readFileSync(new URL(p,import.meta.url),'utf8');
  const probes = read('../supabase/checks/tester_preview_write_probes.sql');
  const manual = read('../supabase/checks/tester_preview_manual_attendance_probes.sql');
  const migration = read('../supabase/migrations/202611170002_register_manual_ledger_attendance.sql');
  const metadata = { functions: [], triggers: [] };
  const build = (m=migration, meta=metadata) => buildManualWriteCheck(sql,probes,meta,m,manual);
  const built = build();
  assert.doesNotThrow(() => validateTesterCheck(TESTER_PROJECT_REF,built));
  assert.doesNotMatch(built,/\bcommit\s*;/i);
  assert.match(built,/'temporary_manual_rpc',true/);
  assert.match(built,/manual_register_duplicate_and_cancel/);
  assert.match(built,/manual_anonymous_execute_denied/);
  // String replacement must preserve PostgreSQL $$ and named dollar quotes verbatim.
  assert.match(built,/as \$\$\s*declare\s*v_actor/);
  assert.ok(built.includes(manual));
  assert.ok(built.indexOf('TESTER_REVIEWED_FUNCTIONS_CHANGED') < built.indexOf('function public.register_manual_ledger_attendance('));
  assert.throws(() => build(migration,{ functions:[{signature:'register_manual_ledger_attendance(uuid,date,uuid)'}],triggers:[] }),/BASELINE_REVIEW_REQUIRED/);
  assert.throws(() => build(migration.replace('commit;','commit;\ncommit;')),/MIGRATION_INVALID/);
  assert.doesNotThrow(() => validateTesterCheck(TESTER_PROJECT_REF,
    buildManualWriteCheck(sql.replaceAll('\n','\r\n'),probes.replaceAll('\n','\r\n'),metadata,migration,manual)));
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
test('extended scope removes recursive dormant user policies and gates definer RPCs', () => {
  const probes = readFileSync(new URL('../supabase/checks/tester_preview_write_probes.sql',import.meta.url),'utf8');
  const extended = readFileSync(new URL('../supabase/checks/tester_preview_extended_probes.sql',import.meta.url),'utf8');
  const metadata = {functions:[{signature:'update_member_role(uuid,text)',definition:'CREATE FUNCTION public.update_member_role() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$\nbegin\nreturn;\nend $$'}],triggers:[],policies:[]};
  const built=buildWriteCheck(sql,probes,metadata);
  assert.match(built,/drop policy %I on public.users/);
  assert.match(built,/alter table public.users enable row level security/);
  assert.match(built,/alter table public.api_keys enable row level security/);
  assert.match(built,/SECURITY DEFINER AS \$\$\nbegin\n  if ipasscare_preview_access.is_tester_actor/);
  assert.match(built,/select count\(\*\) from pg_policies/);
  for(const label of ['revoked_cached_token_list_rpc_denied','suspended_tester_role_rpc_denied','own_study_edit_allowed','forged_student_counsel_denied']) assert.ok(extended.includes(label));
});

test('catalogue candidate scopes direct rows and prevents cross-branch option links', () => {
  assert.match(sql,/alter table public.packages enable row level security/);
  assert.match(sql,/alter table public.package_options enable row level security/);
  assert.match(sql,/create policy preview_catalog_link_guard/);
  assert.match(sql,/p.id=package_id and p.branch_id=package_options.branch_id/);
  const probes=readFileSync(new URL('../supabase/checks/tester_preview_catalog_probes.sql',import.meta.url),'utf8');
  const runner=readFileSync(new URL('../scripts/check-tester-preview.mjs',import.meta.url),'utf8');
  assert.ok(runner.includes('tester_preview_catalog_probes.sql'));
  for(const label of ['catalog_create_edit_delete_rpc','catalog_referenced_retire_rpc',
    'catalog_forged_option_link_denied','catalog_forged_branch_save_rpc_denied',
    'catalog_suspended_','catalog_revoked_','catalog_anon_toggle_denied']) assert.ok(probes.includes(label));
  assert.doesNotMatch(probes,/\bcommit\s*;|https?:\/\//i);
});

test('management menus keep cross-branch links isolated and telemetry read-only for testers', () => {
  assert.match(sql,/create policy preview_class_teacher_guard/);
  assert.match(sql,/create policy preview_pickup_links_guard/);
  assert.match(sql,/create policy preview_route_assignment_scope/);
  for(const operation of ['insert','update','delete']) assert.ok(sql.includes('create policy preview_telemetry_'+operation+'_guard'));
  const probes=readFileSync(new URL('../supabase/checks/tester_preview_menu_probes.sql',import.meta.url),'utf8');
  for(const label of ['menu_own_route_rpc','menu_own_member_shuttle_rpc','menu_class_foreign_teacher_denied',
    'menu_assignment_foreign_route_denied','menu_revoked_','menu_suspended_',
    'menu_manual_teacher_create_delete','menu_admin_role_escalation_denied']) assert.ok(probes.includes(label));
  assert.doesNotMatch(probes,/\bcommit\s*;|https?:\/\//i);
});
