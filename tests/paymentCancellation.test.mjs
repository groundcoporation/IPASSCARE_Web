import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { paymentRefundInfo } from '../src/pages/admin/billing/model/paymentHistory.ts';
import { loadPaymentHistory } from '../src/pages/admin/billing/api/paymentHistory.ts';
import { test } from 'node:test';
import ts from 'typescript';
import { cancelPayment } from '../src/pages/admin/billing/api/paymentCancellation.ts';
import { preparePaymentCancellation } from '../src/pages/admin/billing/model/paymentCancellation.ts';
import { AppError, normalizeError, formatError, errorMessages } from '../src/errors/appError.ts';
const id = '11111111-1111-4111-8111-111111111111';
const payment = patch => ({ id, pg_tid: 'TEST_TRANSACTION', payment_method: 'CARD', status: 'paid', final_amount: 1000, total_amount: 1000, ...patch });
const input = patch => ({ payment: payment(), amount: 1000, remaining: 1000, reason: ' 사유 ', ...patch });
const cardReply = patch => ({ data: { success: true, code: '0000', cancelType: '0', cancelAmount: 1000, ...patch }, error: null });
function mock(reply, rpcReply = { data: { success: true, status: 'cancelled' } }) {
  const calls = [];
  return { calls, client: { functions: { invoke: async (...args) => { calls.push(['edge', ...args]); if (reply instanceof Error) throw reply; return reply; } },
    rpc: async (...args) => { calls.push(['rpc', ...args]); if (rpcReply instanceof Error) throw rpcReply; return rpcReply; },
    from() { calls.push(['FORBIDDEN_TABLE_WRITE']); throw new Error('must not touch payment tables'); },
  } };
}
test('full card cancellation calls the server once with no browser payment/package writes', async () => {
  const d = mock(cardReply()); const result = await cancelPayment(input(), d);
  assert.deepEqual(result, { kind: 'card', alreadyCancelled: false }); assert.deepEqual(d.calls, [['edge', 'kspay-cancel', { body: { payment_id: id, cancel_reason: '사유', cancel_amount: 1000 } }]]);
});
for (const code of ['A0200', '0000', '0200']) test('documented PG success code ' + code + ' is accepted only with the full response contract', async () => {
  const d = mock(cardReply({ code })); await cancelPayment(input(), d); assert.equal(d.calls.length, 1);
});
test('failed, ambiguous, partial or mismatched Edge replies never trigger table fallback', async () => {
  for (const reply of [new Error('private network'), { data: null }, { data: {} }, cardReply({ success: false }), cardReply({ error: 'private body' }), cardReply({ code: 'DECLINED' }), cardReply({ cancelAmount: 500 }), cardReply({ cancelType: '1' }), cardReply({ payment_id: 'other' })]) {
    const d = mock(reply); await assert.rejects(cancelPayment(input(), d), e => e.code === 'PAYMENT_CANCEL_FAILED' && !e.message.includes('private')); assert.equal(d.calls.length, 1); assert.equal(d.calls[0][0], 'edge');
  }
});
for (const [status, code, expected] of [[401, undefined, 'AUTH_REQUIRED'], [403, undefined, 'PERMISSION_DENIED'], [503, 'PGRST202', 'SERVER_UPDATE_REQUIRED']]) test('Edge ' + expected + ' is safe and never retried', async () => {
  const d = mock({ error: { context: new Response(JSON.stringify({ code, error: 'private token' }), { status }) } }); await assert.rejects(cancelPayment(input(), d), e => e.code === expected && !e.message.includes('private')); assert.equal(d.calls.length, 1);
});
test('invalid amount/identity never reaches PG or RPC', async () => {
  for (const patch of [{ amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: Infinity }, { amount: 1.5 }, { amount: 1001 }, { payment: payment({ id: 'bad' }) }, { remaining: -1 }]) {
    const d = mock(cardReply()); await assert.rejects(cancelPayment(input(patch), d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
test('partial and previously-refunded cancellations are blocked pending server policy repair', async () => {
  for (const patch of [{ amount: 500 }, { amount: 500, remaining: 500 }, { amount: 500, remaining: 500, payment: payment({ payment_method: 'CASH', pg_tid: null }) }]) {
    const d = mock(cardReply()); await assert.rejects(cancelPayment(input(patch), d), e => e.code === 'PAYMENT_CANCEL_UNSUPPORTED'); assert.equal(d.calls.length, 0);
  }
});
test('unsupported online methods and missing/inconsistent transaction IDs cannot be locally cancelled', async () => {
  for (const patch of [{ pg_tid: null }, { pg_tid: ' ' }, { pg_tid: 'OFFLINE_legacy' }, { payment_method: 'VBANK' }, { payment_method: 'POINT' }, { payment_method: null }]) {
    const d = mock(cardReply()); await assert.rejects(cancelPayment(input({ payment: payment(patch) }), d), e => e.code === 'PAYMENT_CANCEL_UNSUPPORTED'); assert.equal(d.calls.length, 0);
  }
});
test('already-cancelled/failed/refund rows cannot issue requests', async () => {
  for (const status of ['cancelled', 'canceled', 'failed', 'refunded', 'scheduled']) {
    const d = mock(cardReply()); await assert.rejects(cancelPayment(input({ payment: payment({ status }) }), d), e => e.code === 'CONFLICT_ERROR'); assert.equal(d.calls.length, 0);
  }
});
for (const method of ['CASH', 'OFFLINE_CARD', 'OFFLINE_TRANSFER']) test(method + ' cancellation uses the audited onsite RPC, not a PG request', async () => {
  const d = mock(cardReply()); const result = await cancelPayment(input({ payment: payment({ payment_method: method, pg_tid: null }) }), d);
  assert.deepEqual(result, { kind: 'offline', alreadyCancelled: false }); assert.deepEqual(d.calls, [['rpc', 'cancel_offline_payment', { p_payment_id: id, p_reason: '사유' }]]);
});
test('onsite scheduled/already-cancelled acknowledgements preserve existing RPC contracts', async () => {
  const d = mock(null, { data: { success: true, already_cancelled: true } });
  assert.equal((await cancelPayment(input({ payment: payment({ payment_method: 'CASH', status: 'scheduled', pg_tid: null }) }), d)).alreadyCancelled, true);
});
test('onsite RPC error or unknown result cannot fall back to table writes', async () => {
  for (const reply of [new Error('private'), { error: { code: 'PGRST202' } }, { data: null }, { data: { success: true } }]) {
    const d = mock(null, reply); await assert.rejects(cancelPayment(input({ payment: payment({ payment_method: 'CASH' }) }), d)); assert.equal(d.calls.length, 1);
  }
});
test('preparation does not mutate the payment or input reason', () => { const value = input(); const before = structuredClone(value); assert.equal(preparePaymentCancellation(value).reason, '사유'); assert.deepEqual(value, before); });
const source = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8'); const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }); return new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps)); }
function screen(options = {}) {
  const state = { calls: 0, confirms: 0, alerts: [], errors: [], refreshed: [], closed: 0, loading: false };
  const deps = { AppError, normalizeError, preparePaymentCancellation, cancelTarget: payment(), cancelAmountStr: '1000', cancelReason: '', getRefundInfo: () => ({ remaining: 1000 }), paymentCancelInFlight: { current: false }, paymentViewEpoch: { current: 1 }, cancelModalEpoch: { current: 1 }, supabase: {},
    confirm: () => { state.confirms++; return options.confirm !== false; }, alert: value => state.alerts.push(value), handleError: async (error, fallback, context) => state.errors.push({ error, fallback, context }),
    setCancelLoading: value => { state.loading = value; }, setCancelTarget: () => { state.closed++; }, loadPayments: async (...args) => { state.refreshed.push(args); if (options.refreshError) throw new AppError('PAYMENT_CANCEL_REFRESH_FAILED'); },
    cancelPayment: async () => { state.calls++; return options.cancel ? options.cancel() : { kind: 'card', alreadyCancelled: false }; },
  };
  return { state, deps, run: () => compile('handleCancelPayment', deps)() };
}
test('synchronous cancel lock blocks duplicate prompts and requests before React rerenders', async () => {
  let finish; const s = screen({ cancel: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(); await s.run(); assert.equal(s.state.calls, 1); assert.equal(s.state.confirms, 1);
  finish({ kind: 'card' }); await pending; assert.equal(s.deps.paymentCancelInFlight.current, false); assert.equal(s.state.loading, false); assert.deepEqual(s.state.refreshed, [[false]]);
});
test('unconfirmed cancellation cannot optimistically change payment status or claim success', async () => {
  const s = screen({ cancel: async () => { throw new AppError('PAYMENT_CANCEL_FAILED'); } }); await s.run(); assert.equal(s.state.alerts.length, 0); assert.equal(s.state.refreshed.length, 0); assert.equal(s.state.errors[0].context.transactionId, id); assert.equal(s.state.closed, 1);
  assert.doesNotMatch(handlers.get('handleCancelPayment'), /setPayments|\.from\(|console\./);
});
test('supported-result refresh failure is distinct from another cancel failure', async () => {
  const s = screen({ refreshError: true }); await s.run(); assert.equal(s.state.alerts.length, 1); assert.equal(s.state.errors[0].error.code, 'PAYMENT_CANCEL_REFRESH_FAILED'); assert.equal(s.state.calls, 1);
});
test('unsupported partial request is rejected before confirmation and sending', async () => { const s = screen(); s.deps.cancelAmountStr = '500'; await s.run(); assert.equal(s.state.confirms, 0); assert.equal(s.state.calls, 0); assert.equal(s.state.errors[0].error.code, 'PAYMENT_CANCEL_UNSUPPORTED'); });
test('user confirmation cancellation sends nothing', async () => { const s = screen({ confirm: false }); await s.run(); assert.equal(s.state.calls, 0); assert.equal(s.deps.paymentCancelInFlight.current, false); });
for (const ref of ['paymentViewEpoch', 'cancelModalEpoch']) test(ref + ' change prevents stale modal closing', async () => {
  let finish; const s = screen({ cancel: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(); s.deps[ref].current++; finish({ kind: 'card' }); await pending; assert.equal(s.state.closed, 0); if (ref === 'paymentViewEpoch') assert.equal(s.state.refreshed.length, 0);
});
test('onsite cancellation message distinguishes ledger cancellation from real refund', async () => {
  const s = screen({ cancel: async () => ({ kind: 'offline', alreadyCancelled: false }) }); s.deps.cancelTarget.payment_method = 'CASH'; await s.run(); assert.match(s.state.alerts[0], /실제 환불/);
});
test('refund history calculation blocks attempts to treat a previously-refunded remainder as a new full cancel', () => {
  const get = compile('getRefundInfo', { paymentRefundInfo, payments: [{ pg_tid: 'TEST_TRANSACTION_REFUND', final_amount: -300 }] }); assert.equal(get(payment()).remaining, 700);
});
test('post-cancel read failure emits one refresh error without raw data', async () => {
  const errors = []; const deps = { AppError, normalizeError, formatError, loadPaymentHistory, useCallback: fn => fn, profile: { role: 'admin' }, paymentReadRequest: { current: 1 }, branchFilter: 'all', scopedBranchId: () => null,
    supabase: { from() { const q = { select: () => q, order: () => q, then: resolve => Promise.resolve({ error: { code: '42501', message: 'private name' } }).then(resolve) }; return q; } }, setLoading() {}, setError: value => errors.push(value), setPayments() {} };
  await assert.rejects(compile('loadPayments', deps)(false), e => e.code === 'PAYMENT_CANCEL_REFRESH_FAILED'); assert.equal(errors.filter(Boolean).length, 0);
});
const app = new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('payment cancellation messages match the app catalog', { skip: !existsSync(app) }, () => { const text = readFileSync(app, 'utf8'); for (const code of ['PAYMENT_CANCEL_FAILED', 'PAYMENT_CANCEL_UNSUPPORTED', 'PAYMENT_CANCEL_REFRESH_FAILED']) assert.equal(text.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]); });
