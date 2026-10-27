import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { withBillingReminder } from '../src/utils/billingReminder.ts';

const bill = {
  id: '11111111-1111-4111-8111-111111111111',
  payment_request_id: '22222222-2222-4222-8222-222222222222',
  amount_due: 1000,
  amount_paid: 0,
  status: 'unpaid',
  branch_id: 'test-branch',
};

test('sent bill keeps academy bill ID when reminder query includes payment request ID', () => {
  const request = { id: bill.payment_request_id, reminder_count: 2, last_reminded_at: '2026-10-27T00:00:00Z' };
  const row = withBillingReminder(bill, request);
  assert.equal(row.id, bill.id);
  assert.notEqual(row.id, request.id);
  assert.equal(row.payment_request_id, request.id);
  assert.equal(row.reminder_count, 2);
  assert.equal(row.last_reminded_at, request.last_reminded_at);
  assert.equal('reminder_count' in bill, false);
});

test('unsent bill or unavailable request metadata preserves the bill unchanged', () => {
  const unsent = { ...bill, payment_request_id: null };
  assert.deepEqual(withBillingReminder(unsent, undefined), unsent);
  assert.deepEqual(withBillingReminder(bill, undefined), bill);
});

test('request status, amounts and branch cannot overwrite the academy bill', () => {
  const request = {
    id: bill.payment_request_id, status: 'paid', amount_due: 9999,
    amount_paid: 9999, branch_id: 'other-branch',
    reminder_count: 0, last_reminded_at: null,
  };
  const row = withBillingReminder(bill, request);
  assert.deepEqual(row, { ...bill, reminder_count: 0, last_reminded_at: null });
});

test('multiple bills linked to one request retain separate deletion IDs', () => {
  const request = { id: bill.payment_request_id, reminder_count: 1, last_reminded_at: null };
  const secondBill = { ...bill, id: '33333333-3333-4333-8333-333333333333' };
  const rows = [bill, secondBill].map(value => withBillingReminder(value, request));
  const deletionPayloads = rows.map(value => ({ p_bill_id: value.id }));
  assert.deepEqual(deletionPayloads, [{ p_bill_id: bill.id }, { p_bill_id: secondBill.id }]);
});

test('billing screen uses the allowlist merge and deletes through the academy bill RPC', () => {
  const source = readFileSync(new URL('../src/components/admin/AdminBillingTab.tsx', import.meta.url), 'utf8');
  assert.match(source, /withBillingReminder\(bill, reminders\.get\(bill\.payment_request_id\)\)/);
  assert.doesNotMatch(source, /\.\.\.reminders\.get/);
  assert.match(source, /rpc\('delete_unpaid_academy_bill',\s*\{\s*p_bill_id: bill\.id/);
});
