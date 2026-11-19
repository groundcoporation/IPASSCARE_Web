import test from 'node:test';
import assert from 'node:assert/strict';
import {assertServerAuditTarget,automationSql,assessServerInventory} from '../scripts/tester-server-audit.mjs';
const empty={active_cron_jobs:0,cron_network_commands:0,enabled_network_triggers:0,public_network_functions:0};
test('server audit accepts only an explicit Develop read',()=>{
  assert.doesNotThrow(()=>assertServerAuditTarget('msvwhvonafmeycmcvarv',['--read']));
  assert.throws(()=>assertServerAuditTarget('wsdyrercgbvwlssntwvy',['--read']),/TARGET_MISMATCH/);
  for(const flags of [[],['--apply'],['--read','--apply']])assert.throws(()=>assertServerAuditTarget('msvwhvonafmeycmcvarv',flags),/READ_FLAG_REQUIRED/);
});
test('SQL reads only counts, not command bodies or credentials',()=>{
  for(const flag of [true,false]) {
    const sql=automationSql(flag);
    assert.match(sql,/^begin read only;/);
    assert.match(sql,/commit;$/);
    assert.doesNotMatch(sql,/\b(insert|update|delete|alter|create|drop|grant|revoke|call)\b/i);
    assert.doesNotMatch(sql,/select command|vault[.]|decrypted|net[.]http_post\(/i);
  }
  assert.doesNotMatch(automationSql(false),/from cron.job/);
});
test('inventory discards values/digests and does not auto-approve even an empty project',()=>{
  const report=assessServerInventory([],[{name:'SUPABASE_URL',value:'must-not-print',digest:'must-not-print'}],empty);
  assert.equal(JSON.stringify(report).includes('must-not-print'),false);
  assert.equal(report.releaseApproved,false);
  assert.equal(report.authHooksVerified,false);
  assert.ok(report.remainingChecks.includes('mock_integration_behaviour'));
});
test('deployed functions, external Secret names and automatic paths require review',()=>{
  const report=assessServerInventory([{slug:'payment-confirm',status:'ACTIVE',verify_jwt:true}],
    [{name:'KSNET_AUTH_KEY'}],{...empty,active_cron_jobs:1,enabled_network_triggers:1});
  assert.equal(report.blockers.length,4);
  assert.equal(report.externalRequestsInvoked,false);
  assert.throws(()=>assessServerInventory([],[],{}),/METADATA_INVALID/);
});
