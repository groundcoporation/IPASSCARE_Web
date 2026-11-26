import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { saveOfflinePayment } from '../../../src/pages/admin/billing/api/offlinePayment.ts';
import { AppError, normalizeError, errorMessages } from '../../../src/errors/appError.ts';

const billId = '11111111-1111-4111-8111-111111111111';
const paymentId = '22222222-2222-4222-8222-222222222222';
const packageId = '33333333-3333-4333-8333-333333333333';
const input = { billId, amount: 1000, method: 'cash', timing: 'now', date: '2026-11-25', memo: ' 메모 ' };
const scheduled = { data: { success: true, payment_id: paymentId } };
const confirmed = patch => ({ data: { success: true, payment_id: paymentId, bill_status: 'paid', package_issued: true, user_package_id: packageId, ...patch } });
function dependencies(replies) {
  const calls = [];
  return { calls, client: { rpc: async (...args) => { const reply = replies[calls.length]; calls.push(args); if (reply instanceof Error) throw reply; return reply; } } };
}
for (const [method, expected] of [['cash', 'CASH'], ['offline_card', 'OFFLINE_CARD'], ['bank_transfer', 'OFFLINE_TRANSFER']]) {
  test(method + ' preserves schedule parameters and confirms the returned payment ID once', async () => {
    const d = dependencies([scheduled, confirmed()]); const value = { ...input, method }; const before = structuredClone(value);
    const result = await saveOfflinePayment(value, d);
    assert.deepEqual(d.calls, [['schedule_offline_payment', { p_bill_id: billId, p_amount: 1000, p_payment_method: expected, p_scheduled_at: '2026-11-25T03:00:00.000Z', p_memo: '메모' }], ['confirm_offline_payment', { p_payment_id: paymentId, p_memo: '메모' }]]);
    assert.deepEqual(result, { paymentId, stage: 'confirmed', issues: [] }); assert.deepEqual(value, before);
  });
}
test('scheduled-only registration does not confirm and keeps empty memo as null', async () => {
  const d = dependencies([scheduled]); const result = await saveOfflinePayment({ ...input, timing: 'scheduled', memo: ' ' }, d);
  assert.deepEqual(result, { paymentId, stage: 'scheduled', issues: [] }); assert.equal(d.calls.length, 1); assert.equal(d.calls[0][1].p_memo, null);
});
test('invalid amounts, methods, dates, timing and IDs cannot issue writes', async () => {
  for (const patch of [{ amount: 0 }, { amount: -1 }, { amount: Infinity }, { amount: NaN }, { amount: 1.5 }, { amount: 2147483648 }, { method: 'toString' }, { method: 'card' }, { timing: 'later' }, { date: '' }, { date: '2026-02-30' }, { date: '2026-13-01' }, { billId: 'invalid' }]) {
    const d = dependencies([]); await assert.rejects(saveOfflinePayment({ ...input, ...patch }, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
for (const [code, expected] of [['42501', 'PERMISSION_DENIED'], ['PGRST202', 'SERVER_UPDATE_REQUIRED'], ['PGRST301', 'AUTH_REQUIRED']]) {
  test('schedule ' + expected + ' stops before confirmation without retry', async () => {
    const d = dependencies([{ error: { code, message: 'private phone token' } }]);
    await assert.rejects(saveOfflinePayment(input, d), e => e.code === expected && !e.message.includes('private')); assert.equal(d.calls.length, 1);
  });
  test('confirm ' + expected + ' retains the scheduled payment and pending-stage warning', async () => {
    const d = dependencies([scheduled, { error: { code, message: 'private phone token' } }]); const result = await saveOfflinePayment(input, d);
    assert.equal(result.paymentId, paymentId); assert.equal(result.stage, 'confirmation-unconfirmed');
    assert.deepEqual(result.issues.map(e => e.code), ['PAYMENT_CONFIRM_PENDING', expected]); assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(d.calls.length, 2);
  });
}
test('lost or malformed schedule responses never confirm or re-register', async () => {
  for (const reply of [new Error('private network'), { data: null }, { data: { payment_id: paymentId } }, { data: { success: true, payment_id: 'bad' } }]) {
    const d = dependencies([reply]); await assert.rejects(saveOfflinePayment(input, d), e => e.code === 'PAYMENT_SAVE_FAILED'); assert.equal(d.calls.length, 1);
  }
});
test('lost or malformed confirmation responses retain payment ID and never repeat writes', async () => {
  for (const reply of [new Error('private network'), { data: null }, confirmed({ payment_id: billId }), confirmed({ bill_status: null }), confirmed({ package_issued: undefined }), { data: { success: true } }]) {
    const d = dependencies([scheduled, reply]); const result = await saveOfflinePayment(input, d);
    assert.equal(result.stage, 'confirmation-unconfirmed'); assert.equal(result.paymentId, paymentId); assert.equal(result.issues[0].code, 'PAYMENT_CONFIRM_PENDING'); assert.equal(d.calls.length, 2);
  }
});
test('partial bill payment does not incorrectly report missing pass issuance', async () => {
  const result = await saveOfflinePayment(input, dependencies([scheduled, confirmed({ bill_status: 'partial', package_issued: false, user_package_id: null })]));
  assert.equal(result.stage, 'confirmed'); assert.deepEqual(result.issues, []);
});
test('paid bills without confirmed issued pass records require package verification, not another payment', async () => {
  for (const patch of [{ package_issued: false, user_package_id: null }, { user_package_id: null }]) {
    const result = await saveOfflinePayment(input, dependencies([scheduled, confirmed(patch)]));
    assert.equal(result.stage, 'confirmed'); assert.equal(result.issues[0].code, 'PAYMENT_PACKAGE_PENDING');
  }
});
test('already-paid response confirms payment but cannot prove existing pass issuance', async () => {
  const result = await saveOfflinePayment(input, dependencies([scheduled, { data: { success: true, payment_id: paymentId, already_paid: true, package_issued: false } }]));
  assert.equal(result.stage, 'confirmed'); assert.equal(result.issues[0].code, 'PAYMENT_PACKAGE_PENDING');
});

const source = readFileSync(new URL('../../../src/pages/admin/billing/views/AdminBillingTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminBillingTab.tsx', source, ts.ScriptTarget.Latest, true);
const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) {
  const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps));
}
function screen(options = {}) {
  const state = { calls: 0, loading: false, closed: 0, errors: [], refreshes: [] };
  const deps = { normalizeError, selectedBill: { id: billId }, paidAmount: '1000', paymentMethod: 'cash', paymentTiming: 'now', scheduledAt: input.date, paymentMemo: 'memo',
    billingBusyRef: { current: false }, billingReadSequence: { current: 1 }, supabase: {}, alert() {},
    setActionLoading: value => { state.loading = value; }, setIsPayModalOpen: value => { if (!value) state.closed++; },
    handleError: async (error, fallback, context) => state.errors.push({ error, fallback, context }),
    saveOfflinePayment: async value => { state.calls++; state.input = value; return options.save ? options.save() : { paymentId, stage: 'confirmed', issues: [] }; },
    refreshAfterBillAction: async (...args) => { state.refreshes.push(args); if (options.refreshError) throw new AppError('PAYMENT_REFRESH_FAILED'); },
  };
  return { state, deps, run: () => compile('handleProcessPayment', deps)({ preventDefault() {} }) };
}
test('screen prevents duplicate submits and refreshes both ledgers with the payment-specific code', async () => {
  let finish; const s = screen({ save: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run(); await s.run(); assert.equal(s.state.calls, 1);
  finish({ paymentId, stage: 'confirmed', issues: [] }); await pending;
  assert.equal(s.state.closed, 1); assert.equal(s.deps.billingBusyRef.current, false); assert.equal(s.state.loading, false);
  assert.deepEqual(s.state.refreshes, [[1, 'PAYMENT_REFRESH_FAILED']]);
});
test('screen reports pending confirmation and permissions using the existing transaction UUID', async () => {
  const s = screen({ save: async () => ({ paymentId, stage: 'confirmation-unconfirmed', issues: [new AppError('PAYMENT_CONFIRM_PENDING'), new AppError('PERMISSION_DENIED')] }) }); await s.run();
  assert.deepEqual(s.state.errors.map(e => e.error.code), ['PAYMENT_CONFIRM_PENDING', 'PERMISSION_DENIED']);
  assert.equal(s.state.errors.every(e => e.context.transactionId === paymentId), true); assert.equal(s.state.calls, 1); assert.equal(s.state.closed, 1);
});
test('screen does not turn refresh failure into a new-payment or confirmation failure', async () => {
  const s = screen({ refreshError: true }); await s.run(); assert.equal(s.state.errors[0].error.code, 'PAYMENT_REFRESH_FAILED'); assert.equal(s.state.errors[0].context.transactionId, paymentId); assert.equal(s.state.calls, 1);
});
test('unknown schedule response closes the form and asks to check state instead of immediate resubmit', async () => {
  const s = screen({ save: async () => { throw new AppError('PAYMENT_SAVE_FAILED'); } }); await s.run();
  assert.equal(s.state.closed, 1); assert.equal(s.state.refreshes.length, 0); assert.equal(s.state.errors[0].context.transactionId, billId); assert.equal(s.state.loading, false);
});
test('input or permission rejection keeps the form available and releases busy state', async () => {
  for (const code of ['INPUT_INVALID', 'PERMISSION_DENIED']) {
    const s = screen({ save: async () => { throw new AppError(code); } }); await s.run(); assert.equal(s.state.closed, 0); assert.equal(s.deps.billingBusyRef.current, false);
  }
});
test('completion after a view change cannot close another form', async () => {
  let finish; const s = screen({ save: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run(); s.deps.billingReadSequence.current++; finish({ paymentId, stage: 'confirmed', issues: [] }); await pending; assert.equal(s.state.closed, 0);
});
test('opening another bill while a payment is in flight is blocked', () => {
  let changes = 0; const deps = { billingBusyRef: { current: true }, setSelectedBill: () => changes++ };
  compile('openPayModal', deps)({ id: billId }); assert.equal(changes, 0);
});
test('payment refresh failure code is supported by the shared refresh handler', async () => {
  const deps = { AppError, billingReadSequence: { current: 1 }, activeBranchId: 'branch', selectedMonth: '2026-11', supabase: {}, setLoading() {},
    loadInvoiceData: async () => { throw new Error('private'); }, loadBillingTargetData: async () => ({}),
  };
  for (const key of ['setBills', 'setAppPaymentRequests', 'setBillingPackageOptions', 'setBillingRosterStudents', 'setBillingTargets', 'setTargetBillStatuses']) deps[key] = () => {};
  await assert.rejects(compile('refreshAfterBillAction', deps)(1, 'PAYMENT_REFRESH_FAILED'), e => e.code === 'PAYMENT_REFRESH_FAILED');
});
const appCatalog = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('new payment refresh message is synchronized with the app', { skip: !existsSync(appCatalog) }, () => {
  assert.equal(readFileSync(appCatalog, 'utf8').match(/PAYMENT_REFRESH_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.PAYMENT_REFRESH_FAILED);
});
