import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildTesterPointTriggerGuards,pointTriggerReviews} from '../scripts/tester-point-trigger-guards.mjs';

test('point guard generation fails closed on missing or changed trigger bodies',()=>{
  assert.throws(()=>buildTesterPointTriggerGuards({}),/METADATA_INVALID/);
  assert.throws(()=>buildTesterPointTriggerGuards({functions:[]}),/REVIEW_REQUIRED/);
  assert.throws(()=>buildTesterPointTriggerGuards({functions:[...pointTriggerReviews.keys()].map(signature=>({signature,definition:'unreviewed SQL'}))}),/REVIEW_REQUIRED/);
  assert.equal(pointTriggerReviews.size,2);
});

test('award and reversal candidates validate recipients and exact payment identity',()=>{
  const award=pointTriggerReviews.get('distribute_matrix_points()').guard;
  assert.match(award,/recipient.branch_id is distinct from new.branch_id/);
  assert.match(award,/recipient.id is null/);
  const reverse=pointTriggerReviews.get('reverse_payment_points_on_cancel()').guard;
  assert.match(reverse,/pl.payment_id is distinct from new.id/);
  assert.match(reverse,/recipient.branch_id is distinct from new.branch_id/);
  for(const rule of [award,reverse])assert.doesNotMatch(rule,/insert into|update public|delete from/i);
});

test('point candidate blocks tester ledger mutation and anonymous access',()=>{
  const core=readFileSync(new URL('../supabase/checks/tester_preview_core_policy.sql',import.meta.url),'utf8');
  assert.match(core,/alter table public.point_logs enable row level security/);
  assert.match(core,/revoke all on public.point_logs from anon/);
  for(const op of ['insert','update','delete'])assert.match(core,new RegExp('preview_point_write_'+op));
  for(const op of ['insert','update','delete'])assert.match(core,new RegExp('preview_point_'+op+'_scope on public.point_logs as restrictive'));
  assert.match(core,/preview_payment_scope/);
  const runner=readFileSync(new URL('../scripts/check-tester-local-browser.mjs',import.meta.url),'utf8');
  const cloud=readFileSync(new URL('../scripts/check-tester-preview.mjs',import.meta.url),'utf8');
  for(const text of [runner,cloud])assert.match(text,/buildTesterPointTriggerGuards\(/);
});
