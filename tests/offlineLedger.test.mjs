import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadOfflineLedger, confirmLedgerPayment, cancelLedgerPayment } from '../src/pages/admin/billing/api/offlineLedger.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';

const id = '11111111-1111-4111-8111-111111111111';
const parent = '22222222-2222-4222-8222-222222222222';
const packageId = '33333333-3333-4333-8333-333333333333';
const row = { id, user_id: parent, user_name: '가상 회원', status: 'scheduled', final_amount: 1000, total_amount: 1000, payment_method: 'CASH', memo: 'memo', academy_bill_id: null };
function mock(reply, childReply = { data: [] }) {
  const calls = [];
  const query = {};
  for (const name of ['select', 'in', 'is']) query[name] = (...args) => { calls.push([name, ...args]); return query; };
  query.then = (resolve, reject) => Promise.resolve(childReply).then(resolve, reject);
  return { calls, client: { rpc: async (...args) => { calls.push(args); if (reply instanceof Error) throw reply; return reply; }, from: name => { calls.push(['from', name]); return query; } } };
}
test('ledger reads preserve branch/status, live-child filters and deduplicated parent IDs', async () => {
  const rows = [row, { ...row, id: packageId }]; const before = structuredClone(rows);
  const d = mock({ data: rows }, { data: [{ parent_id: parent, child_name: '자녀 A' }, { parent_id: parent, child_name: '자녀 A' }, { parent_id: parent, child_name: '자녀 B' }] });
  const result = await loadOfflineLedger('branch', 'scheduled', d);
  assert.deepEqual(d.calls, [['list_offline_payments', { p_branch_id: 'branch', p_status: 'scheduled' }], ['from', 'children'], ['select', 'parent_id,child_name'], ['in', 'parent_id', [parent]], ['is', 'deleted_at', null]]);
  assert.deepEqual(result[0].children_names, ['자녀 A', '자녀 B']); assert.deepEqual(rows, before);
});
test('all/unselected branches skip requests and empty ledgers skip child reads', async () => {
  for (const branch of [null, '', 'all']) { const d = mock({}); assert.deepEqual(await loadOfflineLedger(branch, 'scheduled', d), []); assert.equal(d.calls.length, 0); }
  const d = mock({ data: [] }); assert.deepEqual(await loadOfflineLedger('branch', 'paid', d), []); assert.equal(d.calls.length, 1);
});
test('malformed ledger responses do not masquerade as empty successful reads', async () => {
  for (const data of [null, {}, [null], [{ ...row, status: 'paid' }], [{ ...row, id: 'wrong' }]]) {
    const d = mock({ data }); await assert.rejects(loadOfflineLedger('branch', 'scheduled', d), e => e.code === 'OFFLINE_PAYMENT_LOAD_FAILED'); assert.equal(d.calls.length, 1);
  }
});
test('child read failure discards the entire snapshot', async () => {
  const d = mock({ data: [row] }, { error: { code: '42501', message: 'private name' } });
  await assert.rejects(loadOfflineLedger('branch', 'scheduled', d), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private'));
});
for (const [code, expected] of [['42501', 'PERMISSION_DENIED'], ['PGRST202', 'SERVER_UPDATE_REQUIRED']]) {
  test('read ' + expected + ' is normalized without fallback queries', async () => {
    const d = mock({ error: { code, message: 'private token' } }); await assert.rejects(loadOfflineLedger('branch', 'scheduled', d), e => e.code === expected); assert.equal(d.calls.length, 1);
  });
}
test('direct app payment confirmation allows null bill status and verifies package issuance', async () => {
  const d = mock({ data: { success: true, payment_id: id, bill_status: null, package_issued: true, user_package_id: packageId } });
  const result = await confirmLedgerPayment(row, d); assert.equal(result.stage, 'confirmed'); assert.deepEqual(result.issues, []);
  assert.deepEqual(d.calls, [['confirm_offline_payment', { p_payment_id: id, p_memo: 'memo' }]]);
});
test('bill-linked confirmation cannot accept a null bill status', async () => {
  const d = mock({ data: { success: true, payment_id: id, bill_status: null, package_issued: true, user_package_id: packageId } });
  const result = await confirmLedgerPayment({ ...row, academy_bill_id: parent }, d); assert.equal(result.stage, 'confirmation-unconfirmed'); assert.equal(d.calls.length, 1);
});
test('confirmation of a non-scheduled row cannot write', async () => {
  const d = mock({}); await assert.rejects(confirmLedgerPayment({ ...row, status: 'paid' }, d), e => e.code === 'CONFLICT_ERROR'); assert.equal(d.calls.length, 0);
});
for (const status of ['scheduled', 'paid']) test(status + ' cancellation preserves the original reason and uses one RPC', async () => {
  const d = mock({ data: { success: true, status: 'cancelled' } }); const result = await cancelLedgerPayment({ ...row, status }, d);
  assert.deepEqual(result, { alreadyCancelled: false }); assert.deepEqual(d.calls, [['cancel_offline_payment', { p_payment_id: id, p_reason: status === 'paid' ? '관리자 웹 현장결제 취소' : '관리자 웹 현장결제 요청 취소' }]]);
});
test('already-cancelled response remains compatible with the existing no-ID contract', async () => {
  assert.deepEqual(await cancelLedgerPayment(row, mock({ data: { success: true, already_cancelled: true } })), { alreadyCancelled: true });
});
test('malformed/lost cancellation response never retries or claims success', async () => {
  for (const reply of [new Error('private'), { data: null }, { data: { success: true } }, { data: { success: true, status: 'cancelled', payment_id: parent } }]) {
    const d = mock(reply); await assert.rejects(cancelLedgerPayment(row, d), e => e.code === 'OFFLINE_PAYMENT_CANCEL_UNCONFIRMED'); assert.equal(d.calls.length, 1);
  }
});
test('cancel validation and server permission failures cannot bypass the RPC', async () => {
  const invalid = mock({}); await assert.rejects(cancelLedgerPayment({ ...row, status: 'cancelled' }, invalid), e => e.code === 'CONFLICT_ERROR'); assert.equal(invalid.calls.length, 0);
  const denied = mock({ error: { code: '42501', message: 'private' } }); await assert.rejects(cancelLedgerPayment(row, denied), e => e.code === 'PERMISSION_DENIED'); assert.equal(denied.calls.length, 1);
});

const source = readFileSync(new URL('../src/pages/admin/billing/views/AdminOfflinePaymentTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminOfflinePaymentTab.tsx', source, ts.ScriptTarget.Latest, true);
const handlers = new Map();
function visit(n) {
  if (ts.isVariableDeclaration(n) && n.initializer) {
    const value = n.initializer;
    handlers.set(n.name.getText(ast), ts.isCallExpression(value) && value.expression.getText(ast) === 'useCallback' ? value.arguments[0].getText(ast) : value.getText(ast));
  }
  ts.forEachChild(n, visit);
} visit(ast);
function compile(name, deps) {
  const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps));
}
function screen(options = {}) {
  const state = { rows: ['old'], loading: false, errors: [], alerts: [], writes: 0, prompts: 0, processing: null, refreshes: 0 };
  const deps = { AppError, readSequence: { current: 1 }, mutationInFlight: { current: false }, activeBranchId: 'branch', status: 'scheduled', supabase: {},
    setLoading: value => { state.loading = value; }, setPayments: value => { state.rows = value; }, setProcessingId: value => { state.processing = value; },
    handleError: async (error, fallback, context) => state.errors.push({ error, fallback, context }),
    alert: message => state.alerts.push(message), confirm: () => { state.prompts++; return options.confirm !== false; },
    loadOfflineLedger: async () => options.read ? options.read() : [row],
    confirmLedgerPayment: async () => { state.writes++; return options.write ? options.write() : { paymentId: id, stage: 'confirmed', issues: [] }; },
    cancelLedgerPayment: async () => { state.writes++; return options.write ? options.write() : { alreadyCancelled: false }; },
    loadPayments: async value => { state.refreshes++; state.reportError = value; if (options.refreshError) throw new AppError('OFFLINE_PAYMENT_REFRESH_FAILED'); },
  };
  return { state, deps, run: name => compile(name, deps) };
}
test('ledger screen only publishes the newest successful snapshot', async () => {
  let finish; const s = screen({ read: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run('loadPayments')(); s.deps.readSequence.current++; finish([row]); await pending;
  assert.deepEqual(s.state.rows, ['old']); assert.equal(s.state.loading, true);
});
test('current read failures clear old rows and use common errors', async () => {
  const s = screen({ read: async () => { throw new AppError('PERMISSION_DENIED'); } }); await s.run('loadPayments')();
  assert.deepEqual(s.state.rows, []); assert.equal(s.state.errors[0].error.code, 'PERMISSION_DENIED'); assert.equal(s.state.loading, false);
});
test('post-write read failures propagate a distinct refresh warning instead of showing duplicate errors', async () => {
  const s = screen({ read: async () => { throw new Error('private'); } }); await assert.rejects(s.run('loadPayments')(false), e => e.code === 'OFFLINE_PAYMENT_REFRESH_FAILED');
  assert.equal(s.state.errors.length, 0); assert.equal(s.state.loading, false);
});
test('stale failures cannot clear the new view or release its loading state', async () => {
  let fail; const s = screen({ read: () => new Promise((_, reject) => { fail = reject; }) });
  const pending = s.run('loadPayments')(); s.deps.readSequence.current++; fail(new Error('private')); await pending;
  assert.deepEqual(s.state.rows, ['old']); assert.equal(s.state.errors.length, 0); assert.equal(s.state.loading, true);
});
for (const name of ['confirmPayment', 'cancelPayment']) {
  test(name + ' shares a synchronous lock that blocks duplicates before prompting', async () => {
    let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
    const pending = s.run(name)(row); await s.run(name)(row); assert.equal(s.state.writes, 1); assert.equal(s.state.prompts, 1);
    finish({ alreadyCancelled: false, issues: [] }); await pending; assert.equal(s.deps.mutationInFlight.current, false); assert.equal(s.state.processing, null); assert.equal(s.state.reportError, false);
  });
  test(name + ' distinguishes post-write refresh failures and logs the payment UUID', async () => {
    const s = screen({ refreshError: true }); await s.run(name)(row);
    assert.equal(s.state.errors[0].error.code, 'OFFLINE_PAYMENT_REFRESH_FAILED'); assert.equal(s.state.errors[0].context.transactionId, id); assert.equal(s.state.writes, 1);
  });
  test(name + ' cancels without writes and releases locks after errors', async () => {
    const cancelled = screen({ confirm: false }); await cancelled.run(name)(row); assert.equal(cancelled.state.writes, 0);
    const s = screen({ write: async () => { throw new AppError('PERMISSION_DENIED'); } }); await s.run(name)(row);
    assert.equal(s.state.refreshes, 0); assert.equal(s.deps.mutationInFlight.current, false); assert.equal(s.state.processing, null);
  });
  test(name + ' cannot refresh a previous branch/tab after a view switch', async () => {
    let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
    const pending = s.run(name)(row); s.deps.readSequence.current++; finish({ alreadyCancelled: false, issues: [] }); await pending; assert.equal(s.state.refreshes, 0);
  });
}
test('confirmation preserves stage and package warnings without creating a new payment', async () => {
  const s = screen({ write: async () => ({ issues: [new AppError('PAYMENT_PACKAGE_PENDING')] }) }); await s.run('confirmPayment')(row);
  assert.equal(s.state.errors[0].error.code, 'PAYMENT_PACKAGE_PENDING'); assert.equal(s.state.writes, 1); assert.equal(s.state.refreshes, 1);
});
test('paid cancellation keeps its reason and explains separate refund handling', async () => {
  const s = screen(); await s.run('cancelPayment')({ ...row, status: 'paid' }); assert.match(s.state.alerts[0], /실제 환불은 별도로/);
});
const appCatalog = new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('offline ledger messages are synchronized with the app', { skip: !existsSync(appCatalog) }, () => {
  const app = readFileSync(appCatalog, 'utf8');
  for (const code of ['OFFLINE_PAYMENT_LOAD_FAILED', 'OFFLINE_PAYMENT_CANCEL_UNCONFIRMED', 'OFFLINE_PAYMENT_REFRESH_FAILED']) assert.equal(app.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
