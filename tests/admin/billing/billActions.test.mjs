import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { deleteBill, deleteAppPaymentRequest, completeFreeBill } from '../../../src/pages/admin/billing/api/billActions.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const bill = { id, amount_paid: 0, amount_due: 0, status: 'unpaid', payment_request_id: null };
const request = { id: requestId, status: 'pending', issued_source: 'admin_app' };
const freeReply = { success: true, already_completed: false, payment_id: id, user_package_id: requestId };
function rpcClient(reply) {
  const calls = [];
  return { calls, client: { rpc: async (...args) => { calls.push(args); if (reply instanceof Error) throw reply; return reply; } } };
}
const cases = [
  { name: 'web delete', run: deleteBill, input: bill, rpc: 'delete_unpaid_academy_bill', parameters: { p_bill_id: id, p_reason: '수납 관리에서 청구서 삭제' }, data: { success: true, bill_id: id }, unknown: 'BILL_DELETE_UNCONFIRMED' },
  { name: 'app delete', run: deleteAppPaymentRequest, input: request, rpc: 'delete_unpaid_app_payment_request', parameters: { p_request_id: requestId, p_reason: '수납 관리에서 어플 관리자 직접 청구 삭제' }, data: { success: true, request_id: requestId }, unknown: 'BILL_DELETE_UNCONFIRMED' },
  { name: 'free completion', run: completeFreeBill, input: bill, rpc: 'complete_free_academy_bill', parameters: { p_bill_id: id }, data: freeReply, unknown: 'BILL_FREE_FAILED' },
];
for (const c of cases) {
  test(c.name + ' sends the existing RPC once with the correct identity', async () => {
    const d = rpcClient({ data: c.data, error: null }); const input = structuredClone(c.input);
    await c.run(input, d); assert.deepEqual(input, c.input); assert.deepEqual(d.calls, [[c.rpc, c.parameters]]);
  });
  for (const [code, expected] of [['42501', 'PERMISSION_DENIED'], ['PGRST202', 'SERVER_UPDATE_REQUIRED'], ['PGRST301', 'AUTH_REQUIRED']]) {
    test(c.name + ' preserves ' + expected + ' without retry or fallback', async () => {
      const d = rpcClient({ error: { code, message: 'private token name' } });
      await assert.rejects(c.run(c.input, d), e => e.code === expected && !e.message.includes('private'));
      assert.equal(d.calls.length, 1);
    });
  }
  test(c.name + ' treats lost or malformed replies as unconfirmed without retries', async () => {
    for (const reply of [new Error('private response'), { data: null }, { data: { success: false } }, { data: { success: true } }]) {
      const d = rpcClient(reply);
      await assert.rejects(c.run(c.input, d), e => e.code === c.unknown && !e.message.includes('private'));
      assert.equal(d.calls.length, 1);
    }
  });
  test(c.name + ' rejects invalid UUIDs before writes', async () => {
    const d = rpcClient({}); await assert.rejects(c.run({ ...c.input, id: 'wrong' }, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
  });
}
test('web delete accepts only zero-paid deletable bills', async () => {
  for (const patch of [{ amount_paid: 1 }, { amount_paid: -1 }, { status: 'paid' }, { status: 'cancelled' }]) {
    const d = rpcClient({}); await assert.rejects(deleteBill({ ...bill, ...patch }, d), e => e.code === 'BILL_PAYMENT_EXISTS'); assert.equal(d.calls.length, 0);
  }
});
test('app delete cannot delete web-issued or paid requests', async () => {
  for (const patch of [{ issued_source: 'web' }, { issued_source: null }, { status: 'paid' }]) {
    const d = rpcClient({}); await assert.rejects(deleteAppPaymentRequest({ ...request, ...patch }, d), e => e.code === 'CONFLICT_ERROR'); assert.equal(d.calls.length, 0);
  }
});
test('delete acknowledgements must return the same ID, not the connected request ID', async () => {
  for (const [run, input, data] of [[deleteBill, { ...bill, payment_request_id: requestId }, { success: true, bill_id: requestId }], [deleteAppPaymentRequest, request, { success: true, request_id: id }]]) {
    const d = rpcClient({ data }); await assert.rejects(run(input, d), e => e.code === 'BILL_DELETE_UNCONFIRMED'); assert.equal(d.calls.length, 1);
  }
});
test('free completion blocks nonzero, paid and app-sent bills before writes', async () => {
  for (const patch of [{ amount_due: 1 }, { amount_paid: 1 }, { status: 'paid' }, { payment_request_id: requestId }]) {
    const d = rpcClient({}); await assert.rejects(completeFreeBill({ ...bill, ...patch }, d), e => e.code === 'BILL_NOT_FREE'); assert.equal(d.calls.length, 0);
  }
});
test('already-completed free response needs no new payment or package ID', async () => {
  const d = rpcClient({ data: { success: true, already_completed: true } });
  assert.deepEqual(await completeFreeBill(bill, d), { alreadyCompleted: true }); assert.equal(d.calls.length, 1);
});
test('new free completion must confirm both issued record UUIDs', async () => {
  for (const patch of [{ payment_id: null }, { user_package_id: 'invalid' }, { already_completed: 'true' }]) {
    const d = rpcClient({ data: { ...freeReply, ...patch } }); await assert.rejects(completeFreeBill(bill, d), e => e.code === 'BILL_FREE_FAILED');
  }
});

const source = readFileSync(new URL('../../../src/pages/admin/billing/views/AdminBillingTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminBillingTab.tsx', source, ts.ScriptTarget.Latest, true);
const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); }
visit(ast);
function compile(name, dependencies) {
  const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(dependencies), code + '\nreturn handler;')(...Object.values(dependencies));
}
function screen(name, options = {}) {
  const state = { calls: 0, confirms: 0, refreshes: 0, loading: false, alerts: [], errors: [], selected: new Set([id]) };
  const dependencies = {
    billingBusyRef: { current: false }, billingReadSequence: { current: 1 }, actionLoading: false, supabase: {},
    confirm: () => { state.confirms++; return options.confirm !== false; }, alert: message => state.alerts.push(message),
    setActionLoading: value => { state.loading = value; }, setSelectedAppBillIds: updater => { state.selected = updater(state.selected); },
    handleError: async error => state.errors.push(error),
    refreshAfterBillAction: async () => { state.refreshes++; if (options.refreshError) throw new AppError('BILL_ACTION_REFRESH_FAILED'); },
  };
  const action = async () => { state.calls++; if (options.action) return options.action(); return { alreadyCompleted: false }; };
  Object.assign(dependencies, { deleteBill: action, deleteAppPaymentRequest: action, completeFreeBill: action });
  return { state, dependencies, run: compile(name, dependencies) };
}
for (const [name, input] of [['handleDeleteBill', bill], ['handleDeleteAppPaymentRequest', request], ['handleFreeBill', bill]]) {
  test(name + ' blocks duplicates before prompting and releases busy state', async () => {
    let finish; const s = screen(name, { action: () => new Promise(resolve => { finish = resolve; }) });
    const pending = s.run(input); await s.run(input); assert.equal(s.state.confirms, 1); assert.equal(s.state.calls, 1);
    finish({ alreadyCompleted: false }); await pending; assert.equal(s.dependencies.billingBusyRef.current, false); assert.equal(s.state.loading, false); assert.equal(s.state.refreshes, 1);
  });
  test(name + ' keeps a confirmed write distinct from refresh failure', async () => {
    const s = screen(name, { refreshError: true }); await s.run(input);
    assert.equal(s.state.calls, 1); assert.equal(s.state.errors[0].code, 'BILL_ACTION_REFRESH_FAILED'); assert.equal(s.state.alerts.length, 0); assert.equal(s.state.loading, false);
  });
  test(name + ' cancels without writes and never refreshes an unknown mutation', async () => {
    const cancelled = screen(name, { confirm: false }); await cancelled.run(input); assert.equal(cancelled.state.calls, 0);
    const s = screen(name, { action: async () => { throw new AppError('BILL_DELETE_UNCONFIRMED'); } }); await s.run(input);
    assert.equal(s.state.refreshes, 0); assert.equal(s.state.alerts.length, 0); assert.equal(s.dependencies.billingBusyRef.current, false);
  });
}
test('delete completion cannot clear a selection from a newer view', async () => {
  let finish; const s = screen('handleDeleteBill', { action: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run(bill); s.dependencies.billingReadSequence.current++; finish(); await pending;
  assert.equal(s.state.selected.has(id), true);
});
function refreshScreen(options = {}) {
  const state = { updates: [], loading: false };
  const dependencies = { AppError, billingReadSequence: { current: 1 }, activeBranchId: 'branch', selectedMonth: '2026-11', supabase: {}, setLoading: value => { state.loading = value; },
    loadInvoiceData: options.invoices || (async () => ({ bills: ['invoice'], appPaymentRequests: ['request'] })),
    loadBillingTargetData: options.targets || (async () => ({ billingPackageOptions: ['option'], billingRosterStudents: ['student'], targets: ['target'], targetBillStatuses: { key: 'paid' } })),
  };
  for (const key of ['setBills', 'setAppPaymentRequests', 'setBillingPackageOptions', 'setBillingRosterStudents', 'setBillingTargets', 'setTargetBillStatuses']) dependencies[key] = value => state.updates.push([key, value]);
  return { state, dependencies, run: compile('refreshAfterBillAction', dependencies) };
}
test('post-action refresh publishes both snapshots under one request sequence', async () => {
  const s = refreshScreen(); await s.run(1); assert.equal(s.state.updates.length, 6); assert.equal(s.dependencies.billingReadSequence.current, 2); assert.equal(s.state.loading, false);
});
test('failed refresh clears the complete stale snapshot and reports committed-change status', async () => {
  const s = refreshScreen({ targets: async () => { throw new Error('private'); } });
  await assert.rejects(s.run(1), e => e.code === 'BILL_ACTION_REFRESH_FAILED'); assert.equal(s.state.updates.length, 6); assert.equal(s.state.loading, false);
});
test('delivery refresh failure uses the delivery-specific message rather than a completed bill-change claim', async () => {
  const s = refreshScreen({ targets: async () => { throw new Error('private'); } });
  await assert.rejects(s.run(1, 'BILL_DELIVERY_REFRESH_FAILED'), e => e.code === 'BILL_DELIVERY_REFRESH_FAILED');
  assert.equal(s.state.loading, false);
});
for (const fails of [false, true]) test('stale refresh ' + (fails ? 'failure' : 'success') + ' cannot modify a newer view', async () => {
  let finish; const s = refreshScreen({ invoices: () => new Promise((resolve, reject) => { finish = fails ? () => reject(new Error('private')) : () => resolve({ bills: [], appPaymentRequests: [] }); }) });
  const pending = s.run(1); s.dependencies.billingReadSequence.current++; finish(); await pending;
  assert.equal(s.state.updates.length, 0); assert.equal(s.state.loading, true);
});
test('changed view skips old post-action reads completely', async () => {
  const s = refreshScreen(); await s.run(0); assert.equal(s.state.updates.length, 0); assert.equal(s.state.loading, false);
});
const appCatalog = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('new action messages match the app catalog', { skip: !existsSync(appCatalog) }, () => {
  const text = readFileSync(appCatalog, 'utf8');
  for (const code of ['BILL_DELETE_UNCONFIRMED', 'BILL_ACTION_REFRESH_FAILED']) assert.equal(text.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
