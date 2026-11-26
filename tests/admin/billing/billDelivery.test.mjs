import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { sendBillsToApp, sendPaymentReminders } from '../../../src/pages/admin/billing/api/billDelivery.ts';
import { AppError, errorMessages, formatError } from '../../../src/errors/appError.ts';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
const billRow = (id, patch = {}) => ({ bill_id: id, success: true, created: true, payment_request_id: c, ...patch });
const reminderRow = (id, patch = {}) => ({ payment_request_id: id, success: true, push_sent: true, ...patch });
function clientFor(reply) {
  const calls = [];
  return { calls, client: { functions: { invoke: async (...args) => { calls.push(args); if (reply instanceof Error) throw reply; return reply; } } } };
}
for (const [name, run, key, row, fallback] of [
  ['bills', sendBillsToApp, 'academy_bill_ids', billRow, 'BILL_SEND_FAILED'],
  ['reminders', sendPaymentReminders, 'payment_request_ids', reminderRow, 'BILL_REMINDER_FAILED'],
]) {
  test(name + ' deduplicates IDs and invokes the original function once', async () => {
    const input = [a, a, b]; const d = clientFor({ data: { results: [row(a), row(b)] } });
    const result = await run(input, d);
    assert.deepEqual(d.calls, [[name === 'bills' ? 'send-academy-bills' : 'send-payment-reminders', { body: { [key]: [a, b] } }]]);
    assert.deepEqual(result.confirmedIds, [a, b]); assert.deepEqual(input, [a, a, b]);
  });
  test(name + ' validates nonempty UUID lists and the 100-item limit before sending', async () => {
    for (const input of [[], ['not-a-uuid'], Array.from({ length: 101 }, (_, i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0'))]) {
      const d = clientFor({}); await assert.rejects(run(input, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
    }
  });
  test(name + ' preserves confirmed items beside failed and missing results', async () => {
    const d = clientFor({ data: { created: 999, sent: 999, results: [row(a), row(b, { success: false, code: 'PERMISSION_DENIED', error: 'private token name' })] } });
    const result = await run([a, b, c], d);
    assert.equal(result.failed, 1); assert.equal(result.unconfirmed, 1); assert.deepEqual(result.confirmedIds, [a]);
    assert.equal(result.errors[0].code, 'PERMISSION_DENIED'); assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(d.calls.length, 1);
  });
  test(name + ' cannot count duplicate or invalid success rows as confirmed', async () => {
    for (const results of [[row(a), row(a)], [row(a, { success: 'true' })]]) {
      const d = clientFor({ data: { results } }); const result = await run([a], d);
      assert.equal(result.unconfirmed, 1); assert.equal(result.confirmedIds.length, 0); assert.equal(d.calls.length, 1);
    }
  });
  test(name + ' rejects foreign IDs and malformed batch bodies without retry', async () => {
    for (const data of [null, {}, { results: [null] }, { results: [row(b)] }]) {
      const d = clientFor({ data }); await assert.rejects(run([a], d), e => e.code === fallback); assert.equal(d.calls.length, 1);
    }
  });
  test(name + ' treats response loss as unconfirmed, not as permission to resend', async () => {
    const d = clientFor(new Error('private response body'));
    await assert.rejects(run([a], d), e => e.code === fallback && !e.message.includes('private')); assert.equal(d.calls.length, 1);
  });
  for (const [status, code, expected] of [[401, undefined, 'AUTH_REQUIRED'], [403, undefined, 'PERMISSION_DENIED'], [503, 'PGRST204', 'SERVER_UPDATE_REQUIRED']]) {
    test(name + ' maps Edge ' + expected + ' and ignores raw response text', async () => {
      const d = clientFor({ error: { context: new Response(JSON.stringify({ code, error: 'private details' }), { status }) } });
      await assert.rejects(run([a], d), e => e.code === expected && !e.message.includes('private')); assert.equal(d.calls.length, 1);
    });
  }
}
test('bill registration distinguishes created from existing and never claims push delivery', async () => {
  const result = await sendBillsToApp([a, b], clientFor({ data: { results: [billRow(a), billRow(b, { created: false })] } }));
  assert.equal(result.created, 1); assert.equal(result.skipped, 1); assert.equal(result.pushAccepted, 0);
});
test('bill registration requires a payment request UUID and a boolean created flag', async () => {
  for (const patch of [{ created: undefined }, { payment_request_id: null }, { payment_request_id: 'private' }]) {
    const result = await sendBillsToApp([a], clientFor({ data: { results: [billRow(a, patch)] } })); assert.equal(result.unconfirmed, 1);
  }
});
test('reminders distinguish saved app records from push acceptance without leaking warnings', async () => {
  const result = await sendPaymentReminders([a, b], clientFor({ data: { results: [reminderRow(a), reminderRow(b, { push_sent: false, warning: 'private token' })] } }));
  assert.equal(result.sent, 2); assert.equal(result.pushAccepted, 1); assert.equal(result.appOnly, 1); assert.equal(JSON.stringify(result).includes('private'), false);
});
test('reminders without a boolean push status remain unconfirmed', async () => {
  const result = await sendPaymentReminders([a], clientFor({ data: { results: [reminderRow(a, { push_sent: undefined })] } }));
  assert.equal(result.sent, 0); assert.equal(result.unconfirmed, 1);
});
test('failed reminder raw errors are never retained in the result', async () => {
  const result = await sendPaymentReminders([a], clientFor({ data: { results: [reminderRow(a, { success: false, error: 'phone token name' })] } }));
  assert.equal(result.failed, 1); assert.equal(result.errors[0].code, 'BILL_REMINDER_FAILED'); assert.equal(JSON.stringify(result).includes('phone token'), false);
});

const source = readFileSync(new URL('../../../src/pages/admin/billing/views/AdminBillingTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminBillingTab.tsx', source, ts.ScriptTarget.Latest, true);
const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); }
visit(ast);
function screen(name, options = {}) {
  const state = { calls: 0, confirms: 0, refreshes: [], loading: false, errors: [], alerts: [], selected: new Set([a, b]) };
  const result = { created: 1, skipped: 0, sent: 1, pushAccepted: 1, appOnly: 0, failed: 0, unconfirmed: 1, confirmedIds: [a], errors: [] };
  const send = async ids => { state.calls++; state.ids = ids; return options.send ? options.send() : result; };
  const dependencies = {
    billingBusyRef: { current: false }, billingReadSequence: { current: 1 }, selectedAppBillIds: state.selected, supabase: {}, formatError,
    confirm: () => { state.confirms++; return options.confirm !== false; }, alert: message => state.alerts.push(message),
    setActionLoading: value => { state.loading = value; }, handleError: async error => state.errors.push(error),
    sendBillsToApp: send, sendPaymentReminders: send,
    setSelectedAppBillIds: updater => { state.selected = updater(state.selected); },
    refreshAfterBillAction: async (...args) => { state.refreshes.push(args); if (options.refreshError) throw new AppError('BILL_DELIVERY_REFRESH_FAILED'); },
  };
  const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 });
  return { state, dependencies, result, run: new Function(...Object.keys(dependencies), code + '\nreturn handler;')(...Object.values(dependencies)) };
}
for (const name of ['handleSendBillsToApp', 'handleSendPaymentReminders']) {
  test(name + ' blocks duplicates before confirmation and releases its lock', async () => {
    let finish; const s = screen(name, { send: () => new Promise(resolve => { finish = resolve; }) });
    const pending = s.run([a, b]); await s.run([a, b]); assert.equal(s.state.calls, 1); assert.equal(s.state.confirms, 1);
    finish(s.result); await pending; assert.equal(s.dependencies.billingBusyRef.current, false); assert.equal(s.state.loading, false);
    assert.deepEqual(s.state.refreshes, [[1, 'BILL_DELIVERY_REFRESH_FAILED']]);
  });
  test(name + ' cancels without sending', async () => {
    const s = screen(name, { confirm: false }); await s.run([a]); assert.equal(s.state.calls, 0); assert.equal(s.state.refreshes.length, 0);
  });
  test(name + ' reports unknown sends without an automatic refresh or resend', async () => {
    const s = screen(name, { send: async () => { throw new AppError('BILL_SEND_FAILED'); } }); await s.run([a]);
    assert.equal(s.state.errors.length, 1); assert.equal(s.state.calls, 1); assert.equal(s.state.refreshes.length, 0); assert.equal(s.state.loading, false);
  });
  test(name + ' keeps refresh failure distinct from delivery outcome', async () => {
    const s = screen(name, { refreshError: true }); await s.run([a]);
    assert.equal(s.state.alerts.length, 1); assert.equal(s.state.errors[0].code, 'BILL_DELIVERY_REFRESH_FAILED'); assert.equal(s.state.calls, 1);
  });
}
test('bill selection removes confirmed items only and leaves unknown items selected', async () => {
  const s = screen('handleSendBillsToApp'); await s.run(); assert.deepEqual([...s.state.selected], [b]);
});
test('a completed send cannot clear selections from a newer view', async () => {
  let finish; const s = screen('handleSendBillsToApp', { send: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run(); s.dependencies.billingReadSequence.current++; finish(s.result); await pending;
  assert.deepEqual([...s.state.selected], [a, b]);
});
test('reminder confirmation and payload use deduplicated request IDs', async () => {
  const s = screen('handleSendPaymentReminders'); await s.run([a, a]); assert.deepEqual(s.state.ids, [a]);
});
test('empty sends do not prompt or invoke services', async () => {
  const s = screen('handleSendBillsToApp'); s.dependencies.selectedAppBillIds.clear(); await s.run(); assert.equal(s.state.confirms, 0);
  const reminders = screen('handleSendPaymentReminders'); await reminders.run([]); assert.equal(reminders.state.confirms, 0);
});
const appCatalog = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('delivery refresh message is synchronized with the app', { skip: !existsSync(appCatalog) }, () => {
  assert.equal(readFileSync(appCatalog, 'utf8').match(/BILL_DELIVERY_REFRESH_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.BILL_DELIVERY_REFRESH_FAILED);
});
