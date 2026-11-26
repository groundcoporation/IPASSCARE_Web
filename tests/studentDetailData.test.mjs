import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { emptyStudentDetail, loadStudentDetailData } from '../src/pages/admin/students/api/studentDetailData.ts';

const period = { currentMonth: '2026-11', previousMonth: '2026-10', nextMonthStart: '2026-12-01', today: '2026-11-25' };
const student = { id: 'student', child_id: 'child', branch_id: 'branch', student_name: '가상 원생', app_schedule_classes: [{ id: 'fallback-class' }] };
const options = ['one', 'two'].map(id => ({ id, package_id: 'package', label: id, packages: { name: '수업권' } }));
const plan = patch => ({ student_id: 'student', effective_month: '2026-11-01', item_type: 'package', status: 'planned', package_option_id: 'one', ...patch });
function fixture({ errorAt, rejectAt } = {}) {
  const queries = [];
  const rows = { pickup_spots: [], pickup_settings: [], user_packages: [], academy_student_monthly_plans: [], academy_bills: [], academy_student_billing_plan_revisions: [] };
  const client = { from(table) {
    const index = queries.length;
    const filters = [];
    const record = { table, filters: [] };
    queries.push(record);
    let single = false;
    let descendingColumn;
    const query = {
      select(columns) { record.columns = columns; return query; },
      eq(column, value) { filters.push(row => row[column] === value); record.filters.push([column, value]); return query; },
      is(column, value) { filters.push(row => (row[column] ?? null) === value); return query; },
      in(column, values) { filters.push(row => values.includes(row[column])); return query; },
      lte(column, value) { filters.push(row => row[column] <= value); return query; },
      order(column, config) { if (config?.ascending === false) descendingColumn = column; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        if (index === rejectAt) return Promise.reject(new Error('private server detail')).then(resolve, reject);
        const result = rows[table].filter(row => filters.every(filter => filter(row)));
        if (descendingColumn) result.sort((a, b) => String(b[descendingColumn]).localeCompare(String(a[descendingColumn])));
        return Promise.resolve({ data: single ? result[0] || null : result, error: index === errorAt ? { code: '42501', message: 'private server detail' } : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { client, rows, queries };
}
const load = dependencies => loadStudentDetailData(student, options, period, dependencies);

test('manual students skip remote queries and receive independent empty defaults', async () => {
  const dependencies = fixture();
  assert.deepEqual(await loadStudentDetailData({ ...student, child_id: null }, options, period, dependencies), emptyStudentDetail());
  assert.equal(dependencies.queries.length, 0);
  const first = emptyStudentDetail(); first.currentMonthPackages.push({});
  assert.deepEqual(emptyStudentDetail().currentMonthPackages, []);
});

test('empty linked details retain app class fallback and query scope', async () => {
  const dependencies = fixture();
  const result = await load(dependencies);
  assert.deepEqual(result.currentMonthClassIds, ['fallback-class']);
  assert.deepEqual(result.nextMonthClassIds, ['fallback-class']);
  assert.equal(result.currentMonthBillingLocked, false);
  assert.equal(result.currentMonthPackageSource, 'none');
  assert.equal(dependencies.queries.length, 10);
  assert.deepEqual(dependencies.queries[0].filters, [['branch_id', 'branch'], ['is_active', true]]);
  assert.deepEqual(dependencies.queries[1].filters, [['child_id', 'child']]);
  assert.equal(dependencies.queries[3].filters.some(([key, value]) => key === 'effective_month' && value === '2026-12-01'), true);
});

test('pickup and dropoff settings are projected without writes', async () => {
  const dependencies = fixture();
  dependencies.rows.pickup_spots.push({ id: 'spot', name: '정류장', branch_id: 'branch', is_active: true });
  dependencies.rows.pickup_settings.push({ child_id: 'child', pickup_spot_id: 'spot', dropoff_spot_id: 'drop', detail_location: '가상 위치', dropoff_detail_location: '가상 하차 위치' });
  const result = await load(dependencies);
  assert.equal(result.pickupSpotId, 'spot');
  assert.equal(result.dropoffSpotId, 'drop');
  assert.equal(result.pickupDetailLocation, '가상 위치');
  assert.equal(result.pickupSpots.length, 1);
});

test('current plans take precedence and conflicting owned options produce a mismatch', async () => {
  const dependencies = fixture();
  dependencies.rows.academy_student_monthly_plans.push(plan({ id: 'plan' }), plan({ item_type: 'class', class_schedule_id: 'planned-class' }));
  dependencies.rows.user_packages.push({ id: 'owned', child_id: 'child', status: 'active', package_id: 'package', option_id: 'two', package_name: '수업권', valid_from: '2026-11-01', valid_until: '2026-11-30' });
  const result = await load(dependencies);
  assert.equal(result.currentMonthPackageSource, 'current_plan');
  assert.deepEqual(result.currentMonthPackages.map(row => row.package_option_id), ['one']);
  assert.deepEqual(result.currentMonthClassIds, ['planned-class']);
  assert.equal(result.currentBillingPlanMismatches[0].actualOptionId, 'two');
  assert.equal(result.currentBillingPlanMismatches[0].planId, 'plan');
  assert.equal(result.currentMonthBillingLocked, true);
});

test('bill fallback excludes cancelled, void and deleted bills', async () => {
  const dependencies = fixture();
  for (const status of ['cancelled', 'void', 'deleted']) dependencies.rows.academy_bills.push({ student_id: 'student', bill_month: '2026-11', package_option_id: 'two', status });
  let result = await load(dependencies);
  assert.equal(result.currentMonthBillingLocked, false);
  dependencies.rows.academy_bills.push({ student_id: 'student', bill_month: '2026-11', package_option_id: 'one', status: 'unpaid' });
  result = await load(dependencies);
  assert.equal(result.currentMonthPackageSource, 'current_bill');
  assert.deepEqual(result.currentMonthPackages.map(row => row.package_option_id), ['one']);
  assert.equal(result.currentMonthBillingLocked, true);
});

test('previous plan, previous bill and active owned fallbacks retain their priority', async () => {
  const dependencies = fixture();
  dependencies.rows.user_packages.push({ child_id: 'child', status: 'active', option_id: 'two', package_name: '사용권', valid_until: '2026-11-30' }, { child_id: 'child', status: 'active', option_id: 'expired', package_name: '만료권', expiry_date: '2026-11-01' });
  let result = await load(dependencies);
  assert.equal(result.currentMonthPackageSource, 'active_owned');
  assert.deepEqual(result.currentPackageLabels, ['사용권']);
  dependencies.rows.academy_bills.push({ student_id: 'student', bill_month: '2026-10', package_option_id: 'one' });
  result = await load(dependencies);
  assert.equal(result.currentMonthPackageSource, 'previous_bill');
  dependencies.rows.academy_student_monthly_plans.push(plan({ effective_month: '2026-10-01', package_option_id: 'two' }));
  result = await load(dependencies);
  assert.equal(result.currentMonthPackageSource, 'previous_plan');
  assert.deepEqual(result.currentMonthPackages.map(row => row.package_option_id), ['two']);
});

test('an explicit empty recurring revision does not resurrect owned packages', async () => {
  const dependencies = fixture();
  dependencies.rows.academy_student_billing_plan_revisions.push({ student_id: 'student', effective_month: '2026-11-01' });
  dependencies.rows.user_packages.push({ child_id: 'child', status: 'active', option_id: 'one', valid_until: '2026-11-30' });
  const result = await load(dependencies);
  assert.equal(result.currentMonthPackageSource, 'current_plan');
  assert.deepEqual(result.currentMonthPackages, []);
  assert.equal(result.nextMonthPackageSource, 'saved_recurring');
  assert.deepEqual(result.nextMonthPackages, []);
});

test('saved next-month packages take precedence over recurring plans and retain payment settings', async () => {
  const dependencies = fixture();
  dependencies.rows.academy_student_billing_plan_revisions.push({ student_id: 'student', effective_month: '2026-11-01' });
  dependencies.rows.academy_student_monthly_plans.push(plan({ effective_month: '2026-11-01', billing_source: 'standard' }), plan({ effective_month: '2026-12-01', package_option_id: 'two', billing_cycle: '횟수제', payment_day: '매월 5일' }));
  const result = await load(dependencies);
  assert.equal(result.nextMonthPackageSource, 'saved_month');
  assert.deepEqual(result.nextMonthPackages, [{ class_schedule_id: '', package_option_id: 'two', billing_cycle: '횟수제', payment_day: '매월 5일' }]);
});

for (let errorAt = 0; errorAt < 10; errorAt++) {
  test(`detail query ${errorAt + 1} error rejects the complete snapshot without retry`, async () => {
    const dependencies = fixture({ errorAt });
    await assert.rejects(load(dependencies), error => error.code === 'PERMISSION_DENIED' && !error.message.includes('private server detail'));
    assert.equal(dependencies.queries.length, errorAt < 2 ? 2 : 10);
  });
}
test('transport failures normalize to the student domain error', async () => {
  await assert.rejects(load(fixture({ rejectAt: 4 })), error => error.code === 'STUDENT_LOAD_FAILED' && !error.message.includes('private server detail'));
});

// Run the real open/close callbacks with mocked state setters, without mounting or contacting a DB.
const source = readFileSync(new URL('../src/pages/admin/students/views/AdminStudentTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudentTab.tsx', source, ts.ScriptTarget.Latest, true);
let openCode; let closeCode; let effectCode;
const setters = new Set();
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'openModal') {
    openCode = node.initializer.getText(ast);
    function collect(child) {
      if (ts.isCallExpression(child) && /^set[A-Z]/.test(child.expression.getText(ast))) setters.add(child.expression.getText(ast));
      ts.forEachChild(child, collect);
    }
    collect(node.initializer);
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'closeStudentModal') closeCode = node.initializer.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0].getText(ast).includes('detailLoadSequence.current')) effectCode = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function screen(loader) {
  const state = { errors: [] };
  const dependencies = {
    detailLoadSequence: { current: 0 }, saveInFlight: { current: false }, activeBranchId: 'branch', branches: [{ id: 'branch' }], packageOptions: options,
    currentBillMonth: () => period.currentMonth, billMonthByOffset: () => period.previousMonth, nextMonthStart: () => period.nextMonthStart,
    supabase: {}, loadStudentDetailData: loader, emptyStudentDetail,
    emptyAssignment: () => ({ class_schedule_id: '', package_option_id: '', billing_cycle: '월 기간제', payment_day: '매월 1일' }),
    handleError: async (...args) => { state.errors.push(args); },
  };
  for (const setter of setters) dependencies[setter] = value => { state[setter.slice(3)] = value; };
  const code = ts.transpile(`const open = ${openCode}; const closeStudentModal = ${closeCode}; const effect = ${effectCode};`, { target: ts.ScriptTarget.ES2022 });
  return { state, ...new Function(...Object.keys(dependencies), `${code}\nreturn { open, close: closeStudentModal, mount: effect };`)(...Object.values(dependencies)) };
}
test('detail failures do not open a partial editor or leak raw server details', async () => {
  const { state, open } = screen(async () => { throw new Error('simulated failure'); });
  await open(student);
  assert.equal(state.IsModalOpen, false);
  assert.equal(state.PickupSettingsLoading, false);
  assert.equal(state.EditingId, undefined);
  assert.equal(state.errors[0][1], 'STUDENT_LOAD_FAILED');
});
test('post-write detail refresh propagates errors once instead of displaying a second read alert', async () => {
  const failure = new Error('simulated failure');
  const { state, open } = screen(async () => { throw failure; });
  await assert.rejects(open(student, { reportError: false }), error => error === failure);
  assert.equal(state.IsModalOpen, false);
  assert.deepEqual(state.errors, []);
  assert.equal(state.PickupSettingsLoading, false);
});
test('a late student detail cannot overwrite the most recently selected student', async () => {
  const pending = [];
  const { state, open } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = open(student); const second = open({ ...student, id: 'new-student' });
  pending[1](emptyStudentDetail()); await second;
  pending[0](emptyStudentDetail()); await first;
  assert.equal(state.EditingId, 'new-student');
  assert.equal(state.IsModalOpen, true);
});
test('closing an editor invalidates pending loads so they cannot reopen it', async () => {
  let finish;
  const { state, open, close } = screen(() => new Promise(resolve => { finish = resolve; }));
  const pending = open(student); close(); finish(emptyStudentDetail()); await pending;
  assert.equal(state.IsModalOpen, false);
  assert.equal(state.EditingId, undefined);
});
test('new registration clears billing lock and additional option left by an earlier editor', async () => {
  const { state, open } = screen(async () => ({ ...emptyStudentDetail(), currentMonthBillingLocked: true, additionalPackageOptionId: 'two' }));
  await open(student);
  assert.equal(state.CurrentMonthBillingLocked, true);
  await open();
  assert.equal(state.CurrentMonthBillingLocked, false);
  assert.equal(state.AdditionalPackageOptionId, '');
  assert.equal(state.EditingId, null);
});

test('outdated detail failures do not close a newer editor or show old errors', async () => {
  const pending = [];
  const { state, open } = screen(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = open(student); const second = open({ ...student, id: 'new-student' });
  pending[1].resolve(emptyStudentDetail()); await second;
  pending[0].reject(new Error('old failure')); await first;
  assert.equal(state.EditingId, 'new-student');
  assert.equal(state.IsModalOpen, true);
  assert.deepEqual(state.errors, []);
});

test('previous detail requests cannot release the current loading state', async () => {
  const pending = [];
  const { state, open } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = open(student); const second = open({ ...student, id: 'new-student' });
  pending[0](emptyStudentDetail()); await first;
  assert.equal(state.PickupSettingsLoading, true);
  pending[1](emptyStudentDetail()); await second;
  assert.equal(state.PickupSettingsLoading, false);
});

test('branch effect cleanup invalidates pending details on branch change or unmount', async () => {
  let finish;
  const { state, open, mount } = screen(() => new Promise(resolve => { finish = resolve; }));
  const cleanup = mount();
  const pending = open(student);
  cleanup();
  finish(emptyStudentDetail()); await pending;
  assert.equal(state.IsModalOpen, false);
  assert.equal(state.EditingId, undefined);
});
