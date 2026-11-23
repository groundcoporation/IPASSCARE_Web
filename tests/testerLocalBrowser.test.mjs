import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTesterLocalSchema} from '../scripts/tester-local-schema.mjs';
const empty={enums:[],views:[],functions:[],tables:[],sequences:[],indexes:[],policies:[],table_grants:[],sequence_grants:[],triggers:[]};
test('local schema bootstrap refuses customer rows and unreviewed outbound definitions',()=>{
  const sql=buildTesterLocalSchema(empty);
  assert.match(sql,/TESTER_LOCAL_DB_NOT_EMPTY/);
  assert.match(sql,/exists\(select 1 from auth.users\)/);
  assert.throws(()=>buildTesterLocalSchema({...empty,functions:[{definition:'select net.http_post()'}]}),/REVIEW_REQUIRED/);
  assert.throws(()=>buildTesterLocalSchema({...empty,views:[{}]}),/REVIEW_REQUIRED/);
});
test('schema builder preserves a table policy and explicit grants without importing data',()=>{
  const sql=buildTesterLocalSchema({...empty,tables:[{name:'synthetic',rls:true,columns:[{name:'id',type:'uuid',not_null:true}],constraints:[{name:'synthetic_pk',type:'p',definition:'PRIMARY KEY (id)'}]}],
    policies:[{policyname:'synthetic read',tablename:'synthetic',permissive:'PERMISSIVE',cmd:'SELECT',roles:['authenticated'],qual:'true'}],
    table_grants:[{table_name:'synthetic',privilege_type:'SELECT',grantee:'authenticated'}]});
  assert.match(sql,/create table public."synthetic"/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/create policy "synthetic read"/);
  assert.doesNotMatch(sql,/insert into/i);
});
test('real browser runner uses a fresh project, loopback-only network and scoped cleanup',()=>{
  const script=readFileSync(new URL('../scripts/check-tester-local-browser.mjs',import.meta.url),'utf8');
  assert.match(script,/ipasscare-tester-e2e-/);
  assert.match(script,/host_binding_ipv4=127.0.0.1/);
  assert.match(script,/TESTER_LOCAL_REMOTE_LINK_FORBIDDEN/);
  assert.match(script,/cli\(\['stop','--no-backup'\]\)/);
  assert.doesNotMatch(script,/--linked|--all|db reset|supabase_db_ipasscare-local-test/);
  assert.match(script,/existingReproDatabaseChanged:false/);
});

test('journal E2E uses real components and native REST with persisted-row assertions',()=>{
  const fixture=readFileSync(new URL('./fixtures/journalLiveFixture.tsx',import.meta.url),'utf8');
  assert.match(fixture,/AdminStudyTab/);assert.match(fixture,/AdminCounselTab/);
  assert.match(fixture,/supabase.auth.signInWithPassword/);
  const runner=readFileSync(new URL('../scripts/check-tester-local-browser.mjs',import.meta.url),'utf8');
  for(const label of ['_double_submit_one_private_row','_rest_rls_scope','_edit_persisted','_delete_persisted','private_journals_not_copied_to_parent']) assert.ok(runner.includes(label));
  assert.match(runner,/supabase.from\(table\).update/);
  assert.match(runner,/page.waitForLoadState\('networkidle'\)/);
});

test('attendance E2E keeps normal local auth and checks real ledger writes and pass restoration',()=>{
  const fixture=readFileSync(new URL('./fixtures/attendanceLiveFixture.tsx',import.meta.url),'utf8');
  assert.match(fixture,/AdminPage/);assert.match(fixture,/supabase.auth.signInWithPassword/);
  assert.doesNotMatch(fixture,/testLogin\s*=|app_metadata|mock/i);
  const runner=readFileSync(new URL('../scripts/check-tester-local-browser.mjs',import.meta.url),'utf8');
  for(const label of ['attendance_duplicate_click_one_rpc','attendance_consumes_once','attendance_usage_consumed_once',
    'attendance_server_repeat_no_extra_use','attendance_cancel_restores_once',
    'attendance_repeat_cancel_never_over_restores','attendance_foreign_child_rpc_denied']) assert.ok(runner.includes(label));
  assert.match(runner,/202611170002_register_manual_ledger_attendance.sql/);
});

test('revocation E2E exercises refresh and fresh login without masking an active profile',()=>{
  const runner=readFileSync(new URL('../scripts/check-tester-local-browser.mjs',import.meta.url),'utf8');
  assert.match(runner,/for\(const mode of \['refresh','login'\]\)/);
  assert.match(runner,/supabase.auth.refreshSession\(\)/);
  assert.match(runner,/supabase.auth.signOut\(\)/);
  for(const suffix of ['fresh_claim','register_denied','cancel_denied','rows_hidden','state_unchanged'])
    assert.ok(runner.includes('tester_revoked_${mode}_'+suffix));
  assert.ok(runner.indexOf("phase='tester-attendance-fresh-token'")<runner.lastIndexOf("set status='deleted'"));
});

test('local Preview portal E2E renders the real login form without mocked Auth',()=>{
  const fixture=readFileSync(new URL('./fixtures/previewLiveFixture.tsx',import.meta.url),'utf8');
  assert.match(fixture,/PreviewAdminEntry/);
  assert.doesNotMatch(fixture,/signInWithPassword|testLogin\s*=/);
  const runner=readFileSync(new URL('../scripts/check-tester-local-browser.mjs',import.meta.url),'utf8');
  for(const label of ['preview_portal_unmarked_account_denied','preview_portal_real_form_login_allowed',
    'preview_portal_own_students_visible','preview_portal_session_restore_allowed','preview_portal_revoked_session_denied'])
    assert.ok(runner.includes(label));
});
