import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadPaymentHistory } from '../../../src/pages/admin/billing/api/paymentHistory.ts';
import { assemblePaymentHistory, paymentsForMonth, filterPayments, paymentStats, paymentRefundInfo, statusText, paymentDetail, paymentReference } from '../../../src/pages/admin/billing/model/paymentHistory.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';
const row = patch => ({ id: 'p1', user_id: 'u1', created_at: '2026-10-31T15:00:00Z', total_amount: 1000, final_amount: 900, payment_method: 'CARD', status: 'paid', pg_tid: 'TX', users: { name: 'test payer', email: 'test@example.invalid' }, products: [], ...patch });
const relations = patch => ({ products: [], children: [], students: [], packages: [], options: [], charges: [], ...patch });
function mock(patch = {}) {
  const calls = [];
  const responses = { payments: [row({ order_items: [{ package_id: 'pack', option_id: 'option' }] })], user_packages: [], children: [], academy_students: [], packages: [], package_options: [], academy_sms_charge_logs: [], ...patch };
  return { calls, client: { from(table) {
    calls.push([table, 'from']); const q = {};
    for (const method of ['select', 'eq', 'order', 'in', 'is']) q[method] = (...args) => { calls.push([table, method, ...args]); return q; };
    q.then = (yes, no) => Promise.resolve().then(() => {
      const value = responses[table]; if (value instanceof Error) throw value;
      return Array.isArray(value) ? { data: value, error: null } : value;
    }).then(yes, no); return q;
  } } };
}
test('read service preserves explicit payer join, branch scope, sort and related-table filters without writes', async () => {
  const d = mock(); await loadPaymentHistory('branch', d);
  assert.ok(d.calls.some(c => c[0] === 'payments' && c[1] === 'select' && c[2].includes('users!payments_user_id_fkey')));
  assert.deepEqual(d.calls.find(c => c[0] === 'payments' && c[1] === 'eq'), ['payments', 'eq', 'branch_id', 'branch']);
  assert.deepEqual(d.calls.find(c => c[0] === 'children' && c[1] === 'is'), ['children', 'is', 'deleted_at', null]);
  assert.deepEqual(d.calls.find(c => c[0] === 'payments' && c[1] === 'order'), ['payments', 'order', 'created_at', { ascending: false }]);
  assert.equal(d.calls.filter(c => c[1] === 'from').length, 7);
});
test('admin null branch retains all-branch reads while invalid branch cannot query', async () => {
  const d = mock(); await loadPaymentHistory(null, d); assert.equal(d.calls.some(c => c[1] === 'eq'), false);
  for (const branch of ['', 'all']) { const bad = mock(); await assert.rejects(loadPaymentHistory(branch, bad), e => e.code === 'INPUT_INVALID'); assert.equal(bad.calls.length, 0); }
});
for (const table of ['payments', 'user_packages', 'children', 'academy_students', 'packages', 'package_options', 'academy_sms_charge_logs']) test(table + ' permission error never returns a partial history', async () => {
  const d = mock({ [table]: { data: [], error: { code: '42501', message: 'private token and name' } } });
  await assert.rejects(loadPaymentHistory('branch', d), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private'));
});
test('lost response and malformed result normalize safely without retry', async () => {
  for (const response of [new Error('private'), { data: null }, { data: {} }]) {
    const d = mock({ payments: response }); await assert.rejects(loadPaymentHistory('branch', d), e => e.code === 'PAYMENT_HISTORY_LOAD_FAILED');
    assert.equal(d.calls.filter(c => c[0] === 'payments' && c[1] === 'from').length, 1);
  }
});
test('malformed relation data is rejected rather than showing an incomplete payment', async () => {
  const d = mock({ children: { data: null } }); await assert.rejects(loadPaymentHistory('branch', d), e => e.code === 'PAYMENT_HISTORY_LOAD_FAILED');
});
test('empty history skips all ID-dependent lookups but preserves charge-log query', async () => {
  const d = mock({ payments: [] }); assert.deepEqual(await loadPaymentHistory('branch', d), []);
  assert.deepEqual(d.calls.filter(c => c[1] === 'from').map(c => c[0]), ['payments', 'academy_sms_charge_logs']);
});
test('assembly merges child names without duplication and normalizes relation object/array', () => {
  const r = assemblePaymentHistory([row({ users: [row().users] }), row({ id: 'p2', users: [] })], relations({ children: [{ parent_id: 'u1', child_name: 'test child' }], students: [{ parent_user_id: 'u1', student_name: 'test child' }, { parent_user_id: 'u1', student_name: 'test sibling' }] }));
  assert.deepEqual(r[0].childrenNames, ['test child', 'test sibling']); assert.deepEqual(r[0].users, row().users); assert.equal(r[1].users, null);
});
test('linked products take priority over current-catalog recovery and input is unchanged', () => {
  const rows = [row({ order_items: [{ package_id: 'pack', option_id: 'option', quantity: 2 }] })];
  const data = relations({ products: [{ payment_id: 'p1', package_name: 'saved product', price: 50, total_count: 3 }], packages: [{ id: 'pack', name: 'current product' }], options: [{ id: 'option', label: 'current option', price: 99, total_count: 5 }] });
  const before = JSON.stringify([rows, data]); assert.equal(assemblePaymentHistory(rows, data)[0].products[0].package_name, 'saved product'); assert.equal(JSON.stringify([rows, data]), before);
});
test('deleted linked product recovers label from IDs only if catalog row exists', () => {
  const rows = [row({ order_items: [{ package_id: 'pack', option_id: 'option', quantity: 2 }, { package_id: 'missing' }] })];
  const r = assemblePaymentHistory(rows, relations({ packages: [{ id: 'pack', name: 'current product' }], options: [{ id: 'option', label: 'current option', price: 99, total_count: 5 }] }));
  assert.deepEqual(r[0].products, [{ package_name: 'current product - current option', price: 99, total_count: 5 }]);
});
test('charge classification follows existing memo/source/transaction-log logic', () => {
  const r = assemblePaymentHistory([row({ memo: 'i-Point test' }), row({ source: 'web_ipoint' }), row({ pg_tid: 'SMS' }), row()], relations({ charges: [{ pg_tid: 'SMS' }] }));
  assert.deepEqual(r.map(x => x.isIpointCharge), [true, true, true, false]);
});
test('month filtering uses Korean midnight and ignores invalid dates without mutating order', () => {
  const rows = [row({ id: 'oct', created_at: '2026-10-31T14:59:59Z' }), row({ id: 'nov' }), row({ created_at: 'invalid' })];
  assert.deepEqual(paymentsForMonth(rows, '2026-11').map(x => x.id), ['nov']); assert.equal(rows.length, 3);
});
test('search retains payer/email/children/product/reference fields and exact status filtering', () => {
  const rows = [row({ childrenNames: ['test child'], products: [{ package_name: 'Piano', price: 10, total_count: 1 }] })];
  for (const search of [' PIANO ', 'payer', 'example.invalid', 'test child', 'TX', 'p1']) assert.equal(filterPayments(rows, search, 'all').length, 1);
  assert.equal(filterPayments(rows, '', 'scheduled').length, 0); assert.equal(filterPayments(rows, '', 'paid').length, 1);
});
test('statistics retain gross paid-status sum, pending and failed status conventions', () => {
  const rows = ['paid', 'success', 'scheduled', 'pending_payment', 'failed', 'cancelled', 'canceled', 'refunded'].map(status => row({ status }));
  assert.deepEqual(paymentStats(rows), { revenue: 1800, paid: 2, pending: 2, failed: 3 });
  assert.equal(paymentStats([row({ final_amount: 0 })]).revenue, 0);
});
test('refund reference conventions include other months and clamp remaining amount', () => {
  const rows = [row({ pg_tid: 'TX_REFUND', final_amount: -300 }), row({ pg_tid: 'TX-REFUND', final_amount: -400 }), row({ pg_tid: 'other', final_amount: -100 })];
  assert.deepEqual(paymentRefundInfo(row(), rows), { refunded: 700, remaining: 200 });
  assert.deepEqual(paymentRefundInfo(row({ final_amount: 100 }), rows), { refunded: 700, remaining: 0 });
  assert.deepEqual(paymentRefundInfo(null, rows), { refunded: 0, remaining: 0 });
});
test('payment display labels and onsite transaction references preserve existing behavior', () => {
  assert.equal(statusText('scheduled'), '현장결제 대기'); assert.equal(statusText('new'), 'new');
  assert.equal(paymentDetail('VBANK', 'bank:account'), 'bank · account'); assert.equal(paymentDetail('OFFLINE_CARD', null), '현장 결제 : 카드');
  assert.equal(paymentReference(row({ pg_tid: null, status: 'scheduled', payment_method: 'CASH' })), '현장접수-P1');
  assert.equal(paymentReference(row({ pg_tid: null })), 'p1');
});
const source = readFileSync(new URL('../../../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }) + '\nreturn handler;')(...Object.values(deps)); }
function screen(read) {
  const state = { rows: null, errors: [], busy: [], reads: 0 };
  const deps = { AppError, useCallback: fn => fn, profile: { role: 'director', branch_id: 'branch' }, branchFilter: 'branch', scopedBranchId: p => p.branch_id,
    paymentReadRequest: { current: 0 }, supabase: {}, setLoading: v => state.busy.push(v), setError: () => {}, setPayments: v => { state.rows = v; },
    loadPaymentHistory: async (...args) => { state.reads++; return read ? read(...args) : [row()]; }, handleError: async (e, code) => state.errors.push(e instanceof AppError ? e.code : code),
  };
  return { state, deps, run: (...args) => compile('loadPayments', deps)(...args) };
}
test('screen denies unscoped non-admin read and uses common safe errors', async () => {
  const s = screen(); s.deps.profile.branch_id = null; await s.run(); assert.equal(s.state.reads, 0); assert.deepEqual(s.state.rows, []); assert.deepEqual(s.state.errors, ['PERMISSION_DENIED']); assert.equal(s.state.busy.at(-1), false);
});
test('older successful read cannot overwrite new history or release current loading', async () => {
  let finish; const s = screen(() => new Promise(yes => { finish = yes; })); const pending = s.run(); s.deps.paymentReadRequest.current++;
  finish([row()]); await pending; assert.equal(s.state.rows, null); assert.deepEqual(s.state.busy, [true]);
});
test('older failing read cannot clear newer rows or show stale errors', async () => {
  let fail; const s = screen(() => new Promise((_, no) => { fail = no; })); const pending = s.run(); s.deps.paymentReadRequest.current++;
  fail(new Error('private')); await pending; assert.equal(s.state.rows, null); assert.deepEqual(s.state.errors, []); assert.deepEqual(s.state.busy, [true]);
});
test('current failed read clears incomplete data and distinguishes post-cancel refresh', async () => {
  const s = screen(() => { throw new AppError('PERMISSION_DENIED'); }); await s.run(); assert.deepEqual(s.state.rows, []); assert.deepEqual(s.state.errors, ['PERMISSION_DENIED']);
  s.state.errors = []; await assert.rejects(s.run(false), e => e.code === 'PAYMENT_CANCEL_REFRESH_FAILED'); assert.deepEqual(s.state.errors, []);
});
test('month changes schedule a replacement query after payment view invalidation', () => {
  assert.match(source, /\[loadSubTabData, selectedAttendanceDate, attendanceCalendarMonth, paymentMonth\]/);
  assert.match(source, /paymentReadRequest\.current \+= 1;\s*\}, \[branchFilter, profile, paymentMonth, subTab\]/);
  assert.doesNotMatch(handlers.get('loadPayments'), /supabase\.from/);
});
test('payment read error message matches app catalog', () => {
  const app = readFileSync(new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8');
  assert.equal(app.match(/PAYMENT_HISTORY_LOAD_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.PAYMENT_HISTORY_LOAD_FAILED);
});
