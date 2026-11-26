import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadInvoiceData, loadBillingAutomation } from '../src/pages/admin/billing/api/billingReads.ts';
import { billingMonthPeriod } from '../src/pages/admin/billing/model/billingPeriod.ts';

const bill = patch => ({ id: 'bill', branch_id: 'a', bill_month: '2026-11', payment_request_id: 'request', amount_due: 1000, amount_paid: 0, status: 'unpaid', academy_students: { student_name: '가상 원생', child_id: 'child', child: { deleted_at: null } }, ...patch });
function fixture({ errorAt, rejectAt, empty = false } = {}) {
  const queries = [];
  const rows = {
    academy_bills: [bill()],
    payment_requests: [
      { id: 'request', branch_id: 'a', issued_source: 'admin_app', created_at: '2026-11-02T00:00:00+09:00', reminder_count: 2, last_reminded_at: '2026-11-03', final_amount: 9999, status: 'paid' },
      { id: 'app-only', branch_id: 'a', issued_source: 'admin_app', created_at: '2026-11-02T00:00:00+09:00' },
      { id: 'old', branch_id: 'a', issued_source: 'admin_app', created_at: '2026-10-30T00:00:00+09:00' },
    ],
    academy_billing_automation_settings: [{ branch_id: 'a', is_enabled: true, last_run_at: '2026-11-01' }],
    academy_billing_automation_targets: [{ branch_id: 'a', student_id: 'student', is_enabled: true }, { branch_id: 'a', student_id: 'disabled', is_enabled: false }],
  };
  const client = { from(table) {
    const index = queries.length;
    const filters = [];
    let single = false;
    const record = { table, filters: [] }; queries.push(record);
    const query = {
      select(columns) { record.columns = columns; return query; },
      eq(column, value) { filters.push(row => row[column] === value); record.filters.push([column, value]); return query; },
      in(column, values) { filters.push(row => values.includes(row[column])); record.ids = values; return query; },
      gte(column, value) { filters.push(row => row[column] >= value); record.from = value; return query; },
      lte(column, value) { filters.push(row => row[column] <= value); record.to = value; return query; },
      order() { return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        if (index === rejectAt) return Promise.reject(new Error('private detail')).then(resolve, reject);
        const data = empty ? null : rows[table].filter(row => filters.every(filter => filter(row)));
        return Promise.resolve({ data: single ? data?.[0] || null : data, error: index === errorAt ? { code: '42501', message: 'private detail' } : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { client, queries, rows };
}

test('invoice reads preserve bill identity, amounts and status while adding only reminder fields', async () => {
  const dependencies = fixture();
  const result = await loadInvoiceData('a', '2026-11', dependencies);
  assert.equal(result.bills[0].id, 'bill');
  assert.equal(result.bills[0].payment_request_id, 'request');
  assert.equal(result.bills[0].amount_due, 1000);
  assert.equal(result.bills[0].status, 'unpaid');
  assert.equal(result.bills[0].reminder_count, 2);
  assert.deepEqual(result.appPaymentRequests.map(request => request.id), ['app-only']);
  assert.equal(dependencies.rows.academy_bills[0].reminder_count, undefined);
  assert.equal(dependencies.queries[0].filters.some(([column, value]) => column === 'branch_id' && value === 'a'), true);
  assert.equal(dependencies.queries.at(-1).from, '2026-11-01T00:00:00+09:00');
  assert.equal(dependencies.queries.at(-1).to, '2026-11-30T23:59:59+09:00');
});

test('archived student invoices remain visible while unarchived deleted links are excluded', async () => {
  const dependencies = fixture();
  dependencies.rows.academy_bills = [
    bill({ id: 'archived', academy_students: { archived_at: '2026-11-01', child_id: 'child', child: { deleted_at: '2026-11-01' }, parent_user_id: 'parent', parent: { status: 'deleted' } } }),
    bill({ id: 'deleted-child', academy_students: { child_id: 'child', child: { deleted_at: '2026-11-01' } } }),
    bill({ id: 'deleted-parent', academy_students: { parent_user_id: 'parent', parent: { status: 'deleted' } } }),
    bill({ id: 'manual', payment_request_id: null, academy_students: { child_id: null } }),
    bill({ id: 'missing', academy_students: null }),
  ];
  const result = await loadInvoiceData('a', '2026-11', dependencies);
  assert.deepEqual(result.bills.map(row => row.id), ['archived', 'manual']);
});

for (const branch of [null, 'all']) {
  test(`${branch} history preserves existing all-branch behavior`, async () => {
    const dependencies = fixture(); dependencies.rows.academy_bills.push(bill({ id: 'other', branch_id: 'b' }));
    const result = await loadInvoiceData(branch, '2026-11', dependencies);
    assert.equal(result.bills.length, 2);
    assert.equal(dependencies.queries.some(query => query.filters.some(([column]) => column === 'branch_id')), false);
  });
}
test('reminder metadata batches unique IDs in groups of at most 100', async () => {
  const dependencies = fixture();
  dependencies.rows.academy_bills = Array.from({ length: 202 }, (_, index) => bill({ id: `bill-${index}`, payment_request_id: `request-${index % 201}` }));
  await loadInvoiceData('a', '2026-11', dependencies);
  const batches = dependencies.queries.filter(query => query.ids);
  assert.deepEqual(batches.map(query => query.ids.length), [100, 100, 1]);
  assert.equal(new Set(batches.flatMap(query => query.ids)).size, 201);
});
test('empty responses yield a complete empty snapshot and skip reminder queries', async () => {
  const dependencies = fixture({ empty: true });
  assert.deepEqual(await loadInvoiceData('a', '2026-11', dependencies), { bills: [], appPaymentRequests: [] });
  assert.equal(dependencies.queries.length, 2);
});
for (const errorAt of [0, 1, 2]) {
  test(`history query ${errorAt + 1} permission error rejects the entire snapshot`, async () => {
    const dependencies = fixture({ errorAt });
    await assert.rejects(loadInvoiceData('a', '2026-11', dependencies), error => error.code === 'PERMISSION_DENIED' && !error.message.includes('private detail'));
    assert.equal(dependencies.queries.length, errorAt + 1);
  });
}
test('a later reminder batch error does not return partially enriched invoices', async () => {
  const dependencies = fixture({ errorAt: 2 });
  dependencies.rows.academy_bills = Array.from({ length: 101 }, (_, index) => bill({ id: `bill-${index}`, payment_request_id: `request-${index}` }));
  await assert.rejects(loadInvoiceData('a', '2026-11', dependencies), error => error.code === 'PERMISSION_DENIED');
});
test('rejected transport reads become safe bill load errors', async () => {
  await assert.rejects(loadInvoiceData('a', '2026-11', fixture({ rejectAt: 0 })), error => error.code === 'BILL_LOAD_FAILED' && !error.message.includes('private detail'));
});
test('billing period retains leap-year and year-boundary behavior', () => {
  assert.deepEqual(billingMonthPeriod('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(billingMonthPeriod('2026-12'), { start: '2026-12-01', end: '2026-12-31' });
});
test('automation settings read enabled targets only for the requested branch', async () => {
  const dependencies = fixture();
  assert.deepEqual(await loadBillingAutomation('a', dependencies), { enabled: true, lastRunAt: '2026-11-01', targetStudentIds: ['student'] });
  assert.equal(dependencies.queries.every(query => query.filters.some(([column, value]) => column === 'branch_id' && value === 'a')), true);
});
for (const branch of [null, 'all']) {
  test(`${branch} automation returns disabled defaults without DB requests`, async () => {
    const dependencies = fixture();
    assert.deepEqual(await loadBillingAutomation(branch, dependencies), { enabled: false, lastRunAt: null, targetStudentIds: [] });
    assert.equal(dependencies.queries.length, 0);
  });
}
for (const errorAt of [0, 1]) {
  test(`automation query ${errorAt + 1} errors are not ignored`, async () => {
    await assert.rejects(loadBillingAutomation('a', fixture({ errorAt })), error => error.code === 'PERMISSION_DENIED');
  });
}

// Exercise actual screen callbacks and tab cleanup, with no browser or backend connection.
const source = readFileSync(new URL('../src/pages/admin/billing/views/AdminBillingTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminBillingTab.tsx', source, ts.ScriptTarget.Latest, true);
const definitions = new Map();
let invoiceEffect; let automationEffect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) definitions.set(node.name.text, node.initializer.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const body = node.arguments[0].getText(ast);
    if (body.includes('billingReadSequence.current')) invoiceEffect = body;
    if (body.includes('automationReadSequence.current')) automationEffect = body;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function screen(loader, automation = async () => ({ enabled: false, lastRunAt: null, targetStudentIds: [] })) {
  const state = { bills: [], requests: [], loading: false, enabled: false, lastRun: null, targets: new Set(), errors: [], roster: [] };
  const dependencies = {
    useCallback: fn => fn,
    billingReadSequence: { current: 0 }, automationReadSequence: { current: 0 }, automationReadyBranch: { current: null }, activeBranchId: 'a', selectedMonth: '2026-11', subTab: 'invoices',
    supabase: { from() { const query = { then: resolve => Promise.resolve({ data: [], error: null }).then(resolve) }; for (const method of ['select', 'eq', 'is', 'in', 'lte', 'or', 'not']) query[method] = () => query; return query; } },
    billingMonthPeriod, loadInvoiceData: loader, loadBillingAutomation: automation,
    loadBillingTargetData: async () => ({ billingPackageOptions: [], billingRosterStudents: [], targets: [], targetBillStatuses: {} }),
    setBills: value => { state.bills = value; }, setAppPaymentRequests: value => { state.requests = value; }, setLoading: value => { state.loading = value; },
    setAutoBillingEnabled: value => { state.enabled = value; }, setAutoBillingLastRun: value => { state.lastRun = value; }, setAutoBillingTargetStudentIds: value => { state.targets = value; },
    setBillingPackageOptions() {}, setBillingRosterStudents: value => { state.roster = value; }, setBillingTargets() {}, setTargetBillStatuses() {},
    handleError: async (...args) => { state.errors.push(args); },
  };
  const names = ['loadBills', 'loadAutoBillingSetting', 'loadBillingTargets', 'normalizedBillingLabel', 'billingCommercialIdentity'];
  const code = ts.transpile(names.map(name => `const ${name} = ${definitions.get(name)};`).join('\n') + `\nconst effect = ${invoiceEffect}; const automationEffect = ${automationEffect};`, { target: ts.ScriptTarget.ES2022 });
  return { state, ...new Function(...Object.keys(dependencies), `${code}\nreturn { run: loadBills, settings: loadAutoBillingSetting, targets: loadBillingTargets, mount: effect, mountSettings: automationEffect };`)(...Object.values(dependencies)) };
}
const snapshot = id => ({ bills: [{ id }], appPaymentRequests: [{ id }] });
test('a late invoice response cannot overwrite the latest month refresh', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run(); const second = run(); pending[1](snapshot('new')); await second; pending[0](snapshot('old')); await first;
  assert.equal(state.bills[0].id, 'new'); assert.equal(state.loading, false);
});
test('stale invoice errors do not clear fresh data or show old alerts', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = run(); const second = run(); pending[1].resolve(snapshot('new')); await second; pending[0].reject(new Error('old error')); await first;
  assert.equal(state.bills[0].id, 'new'); assert.deepEqual(state.errors, []);
});
test('a current read failure clears both invoice sources and releases loading', async () => {
  const { state, run } = screen(async () => { throw new Error('failure'); });
  state.bills = state.requests = [{ id: 'old' }]; await run();
  assert.deepEqual(state.bills, []); assert.deepEqual(state.requests, []); assert.equal(state.loading, false); assert.equal(state.errors.length, 1);
});
test('older invoice requests cannot release loading for the latest request', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run(); const second = run(); pending[0](snapshot('old')); await first; assert.equal(state.loading, true); pending[1](snapshot('new')); await second;
});
test('switching to billing targets invalidates pending invoice publication', async () => {
  let finish;
  const { state, run, targets } = screen(() => new Promise(resolve => { finish = resolve; }));
  const pending = run(); await targets(); finish(snapshot('late')); await pending;
  assert.deepEqual(state.bills, []); assert.deepEqual(state.errors, []); assert.equal(state.loading, false);
});
test('invoice effect cleanup invalidates publication on tab/month change or unmount', async () => {
  let finish;
  const { state, mount } = screen(() => new Promise(resolve => { finish = resolve; }));
  const cleanup = mount(); cleanup(); finish(snapshot('late')); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state.bills, []);
});
test('late automation responses cannot overwrite newer branch settings', async () => {
  const pending = [];
  const { state, settings } = screen(async () => snapshot('bill'), () => new Promise(resolve => pending.push(resolve)));
  const first = settings(); const second = settings();
  pending[1]({ enabled: true, lastRunAt: 'new', targetStudentIds: ['new'] }); await second;
  pending[0]({ enabled: false, lastRunAt: 'old', targetStudentIds: ['old'] }); await first;
  assert.equal(state.enabled, true); assert.equal(state.lastRun, 'new'); assert.deepEqual([...state.targets], ['new']);
});
test('automation failures clear stale settings and use the common error handler', async () => {
  const { state, settings } = screen(async () => snapshot('bill'), async () => { throw new Error('failure'); });
  state.enabled = true; state.targets = new Set(['old']); await settings();
  assert.equal(state.enabled, false); assert.deepEqual([...state.targets], []); assert.equal(state.errors.length, 1);
});
