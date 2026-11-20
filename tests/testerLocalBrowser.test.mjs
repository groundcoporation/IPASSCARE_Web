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
