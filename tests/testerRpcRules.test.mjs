import test from 'node:test';
import assert from 'node:assert/strict';
import { testerRpcRules,patchTesterRpc } from '../scripts/tester-rpc-rules.mjs';
test('reviewed RPC rules keep a server-controlled active tester gate and preserve the old body', () => {
  assert.equal(testerRpcRules.size,14);
  const original='CREATE FUNCTION public.synthetic() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $body$\nBEGIN\n  perform original_action();\nEND\n$body$';
  for(const [signature,rule] of testerRpcRules) {
    const patched=patchTesterRpc(original,rule);
    assert.match(patched,/is_tester_actor\(\) then/);
    assert.match(patched,/core_scope\(\)='' then raise exception/);
    assert.ok(patched.includes('perform original_action();'),signature);
    assert.ok(patched.indexOf('core_scope')<patched.indexOf('perform original_action();'));
    assert.ok(patched.includes('$body$'));
  }
  assert.throws(()=>patchTesterRpc('select true',''),/LAYOUT_CHANGED/);
});
test('cancellation uses scoped soft cancellation, not legacy count restoration', () => {
  const rule=testerRpcRules.get('cancel_class_reservation(uuid,uuid)');
  assert.match(rule,/r\.user_id=p_user_id/);
  assert.match(rule,/r\.branch_id=ipasscare_preview_access\.core_scope\(\)/);
  assert.match(rule,/return public\.soft_delete_reservation\(p_reservation_id\)/);
  assert.doesNotMatch(rule,/remaining_count\s*=/);
});
test('referral replay is blocked and beneficiary inputs validate child scope', () => {
  assert.match(testerRpcRules.get('process_referral_points(uuid,uuid,integer,text)'),/raise exception/);
  assert.match(testerRpcRules.get('assign_user_package_beneficiary(uuid,text,uuid)'),/valid_child_link/);
});

test('catalogue RPCs check both the supplied branch and stored package scope', () => {
  const save=testerRpcRules.get('save_package_catalog(uuid,text,text,text,text,integer,boolean,boolean,text,jsonb)');
  assert.match(save,/p_branch_id is distinct from ipasscare_preview_access.core_scope/);
  for(const signature of ['save_package_catalog(uuid,text,text,text,text,integer,boolean,boolean,text,jsonb)',
    'set_package_catalog_active(uuid,boolean)','retire_or_delete_package_catalog(uuid)']) {
    assert.match(testerRpcRules.get(signature),/p.id=p_package_id and p.branch_id=ipasscare_preview_access.core_scope/);
  }
});

test('shuttle RPCs validate server scope and stored route/member ownership', () => {
  const route=testerRpcRules.get('save_shuttle_route_with_assignments(uuid,text,text,text,text,uuid,text,double precision,double precision,jsonb)');
  assert.match(route,/p_branch_id is distinct from ipasscare_preview_access.core_scope/);
  assert.match(route,/r.id=p_route_id and r.branch_id=ipasscare_preview_access.core_scope/);
  assert.match(testerRpcRules.get('save_member_shuttle_settings(uuid,jsonb,jsonb)'),/u.id=p_user_id/);
});
