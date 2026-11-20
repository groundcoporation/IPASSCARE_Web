import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTesterPackageGrant} from '../scripts/tester-package-grant.mjs';
import {testerRpcRules,testerPackageGrantScope} from '../scripts/tester-rpc-rules.mjs';
const sql=readFileSync(new URL('../supabase/checks/tester_preview_package_grant.sql',import.meta.url),'utf8');
const probes=readFileSync(new URL('../supabase/checks/tester_preview_package_probes.sql',import.meta.url),'utf8');
test('tester legacy grant is denied while private business copy retains scope guards',()=>{
  const signature='grant_member_package_with_schedule(uuid,uuid,uuid,date,uuid[])';
  assert.match(testerRpcRules.get(signature),/raise exception/);
  const metadata={functions:[{signature,definition:'CREATE OR REPLACE FUNCTION public.grant_member_package_with_schedule() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$\nbegin\nreturn null;\nend $$'}]};
  const built=buildTesterPackageGrant(metadata,sql);
  assert.match(built,/FUNCTION ipasscare_preview_access.grant_member_package_with_schedule/);
  assert.match(built,/revoke all on function ipasscare_preview_access.grant_member_package_with_schedule.*from public,anon,authenticated/);
  assert.ok(built.includes(testerPackageGrantScope));
  assert.match(testerPackageGrantScope,/c.parent_id=p_user_id/);
  assert.throws(()=>buildTesterPackageGrant({functions:[]},sql),/BASELINE_CHANGED/);
});
test('grant wrapper binds actor/request/payload and serializes replay without external delivery',()=>{
  assert.match(sql,/primary key\(actor_id,request_id\)/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/cached.payload is distinct from request_payload/);
  assert.match(sql,/return cached.response\|\|jsonb_build_object\('replayed',true\)/);
  assert.ok(sql.indexOf('scope in')<sql.indexOf('return cached.response'));
  assert.ok(sql.indexOf('result:=ipasscare_preview_access.grant_member')<sql.indexOf('insert into ipasscare_preview_access.package_grant_requests'));
  assert.doesNotMatch(sql,/https?:|net\.http|push_token|insert into public.notifications/i);
});
test('package probes distinguish duplicate-safe requests, partial rollback, correction and billing guards',()=>{
  for(const label of ['package_grant_repeat_same_request_once','package_grant_changed_payload_conflict',
    'package_grant_failed_transaction_retry_same_key','package_grant_next_month',
    'package_additional_create_and_duplicate_rejected','package_additional_billed_delete_rejected',
    'package_correction_repeat_one_log_no_pass_change','package_legacy_grant_tester_denied',
    'package_revoked_','package_suspended_']) assert.ok(probes.includes(label));
  assert.doesNotMatch(probes,/\bcommit\s*;|https?:\/\//i);
});
