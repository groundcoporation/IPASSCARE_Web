import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryTesterRpc} from '../scripts/tester-rpc-inventory.mjs';
const grant=role=>({role,privilege:'EXECUTE'});
const f=(signature,definition,grants=[grant('authenticated')])=>({signature,definition,grants});

test('inventory distinguishes client entry points, triggers and server-only functions',()=>{
  const report=inventoryTesterRpc({functions:[
    f('unknown_write(uuid)','RETURNS void LANGUAGE plpgsql SECURITY DEFINER'),
    f('helper(text)','RETURNS boolean LANGUAGE sql'),
    f('trigger_fn()','RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER',[grant('PUBLIC')]),
    f('server_fn()','RETURNS void SECURITY DEFINER',[grant('service_role')]),
    f('delete_unpaid_academy_bill(uuid,text)','RETURNS jsonb SECURITY DEFINER'),
  ]});
  assert.equal(report.pendingCount,2);assert.equal(report.guardedMetadataCount,1);
  assert.deepEqual(report.pending,['unknown_write(uuid)','helper(text)']);
  assert.equal(report.functions[2].category,'trigger_review_separate');
  assert.equal(report.functions[2].anonymousExecute,true);
  assert.equal(report.functions[3].category,'server_only');
  assert.equal(report.releaseApproved,false);
});

test('inventory never emits function bodies, credentials or unvalidated signatures',()=>{
  const report=inventoryTesterRpc({functions:[f('example()','RETURNS void SECRET_BODY')]});
  assert.equal(JSON.stringify(report).includes('SECRET_BODY'),false);
  assert.throws(()=>inventoryTesterRpc({}),/METADATA_INVALID/);
  assert.throws(()=>inventoryTesterRpc({functions:[f('unsafe;','select 1')]}),/METADATA_INVALID/);
  assert.deepEqual(inventoryTesterRpc({functions:[f('is_staff_role(text)','select malicious_change()')]}).pending,['is_staff_role(text)']);
});
