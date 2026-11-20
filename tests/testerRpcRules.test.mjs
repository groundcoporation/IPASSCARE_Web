import test from 'node:test';
import assert from 'node:assert/strict';
import { testerRpcRules,patchTesterRpc } from '../scripts/tester-rpc-rules.mjs';
test('reviewed RPC rules keep a server-controlled active tester gate and preserve the old body', () => {
  assert.equal(testerRpcRules.size,34);
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

test('monthly entry points and direct dependencies validate student, timetable and package ownership', () => {
  const signatures=[
    'save_student_schedule_and_billing_all_months(uuid,uuid[],uuid[],boolean,date,uuid[],uuid[],boolean)',
    'save_student_schedule_and_billing_all_months(uuid,uuid[],uuid[],boolean,date,uuid[],uuid[])',
    'save_current_month_student_schedule_and_billing(uuid,uuid[],boolean,uuid[])',
    'save_future_month_student_schedule_and_billing(uuid,date,uuid[],uuid[])',
    'sync_current_and_next_month_student_schedules(uuid,uuid[],boolean)',
    'sync_current_month_student_schedules(uuid,uuid[])','sync_future_month_student_schedules(uuid,date,uuid[])',
    'save_current_month_student_billing_draft(uuid,uuid[])','save_student_monthly_package_plan(uuid,date,uuid[])',
    'reconcile_current_month_active_package_plans(uuid,uuid[])'];
  for(const signature of signatures) {
    const rule=testerRpcRules.get(signature);
    assert.match(rule,/s.id=p_student_id and s.branch_id=ipasscare_preview_access.core_scope/);
    assert.match(rule,/c.parent_id=s.parent_user_id/);
    assert.match(rule,/u.id=s.parent_user_id and u.branch_id=s.branch_id/);
  }
  const unified=testerRpcRules.get(signatures[0]);
  for(const field of ['p_current_schedule_ids','p_next_schedule_ids','p_current_package_option_ids','p_next_package_option_ids']) assert.ok(unified.includes(field));
  assert.match(unified,/o.branch_id=ipasscare_preview_access.core_scope/);
  assert.match(unified,/p.branch_id=ipasscare_preview_access.core_scope/);
  assert.match(testerRpcRules.get('sync_current_month_child_schedule(uuid,uuid,uuid[])'),/c.parent_id=p_user_id/);
});

test('offline management RPC candidates validate the server branch and linked payment owner',()=>{
  assert.match(testerRpcRules.get('list_offline_payments(text,text)'),/p_branch_id is distinct from/);
  assert.match(testerRpcRules.get('schedule_offline_payment(uuid,integer,text,timestamp with time zone,text)'),/b.id=p_bill_id/);
  for(const signature of ['confirm_offline_payment(uuid,text)','cancel_offline_payment(uuid,text)']) {
    assert.match(testerRpcRules.get(signature),/p.id=p_payment_id/);
    assert.match(testerRpcRules.get(signature),/u.branch_id=p.branch_id/);
    assert.match(testerRpcRules.get(signature),/b.branch_id=p.branch_id/);
  }
});
