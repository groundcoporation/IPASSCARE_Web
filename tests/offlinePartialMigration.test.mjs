import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/202611200001_fix_offline_partial_cancellation_status.sql',import.meta.url),'utf8');
test('partial cancellation migration is a bounded, guarded definition replacement',()=>{
  assert.match(sql,/^begin;/);
  assert.match(sql,/commit;\s*$/);
  assert.match(sql,/to_regprocedure\('public.cancel_offline_payment\(uuid,text\)'\)/);
  assert.match(sql,/v_remaining_paid > 0 then ''partial''/);
  assert.match(sql,/execute replace\(definition,old_fragment,new_fragment\)/);
  assert.match(sql,/SERVER_UPDATE_REQUIRED/);
  assert.doesNotMatch(sql,/\b(?:drop|grant|revoke|update public|delete from)\b/i);
  assert.match(sql,/strpos\(definition,new_fragment\)>0 then return/);
});
test('local E2E covers partial balance, repeat cancellation, zero state and ACL preservation',()=>{
  const runner=readFileSync(new URL('../scripts/check-tester-local-browser.mjs',import.meta.url),'utf8');
  for(const label of ['partial_fix_preserves_function_acl_security','partial_fix_idempotent_apply',
    'partial_cancel_keeps_remaining_amount','partial_cancel_keeps_partial_status',
    'partial_repeat_cancel_preserves_balance','partial_all_cancelled_resets_zero_unpaid',
    'partial_full_payment_one_pass','partial_no_pass_before_full_payment'])assert.ok(runner.includes(label));
});
