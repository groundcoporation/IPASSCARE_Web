import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { buildBillingTargets } from '../src/pages/admin/billing/model/billingTargetCalculation.ts';
import { loadBillingTargetData } from '../src/pages/admin/billing/api/billingTargets.ts';

const option = (id = 'option', voucher = 'lesson') => ({ id, label: id, price: 3000, packages: { id: 'product', name: '가상 이용권', voucher_type: voucher } });
const appStudent = (id = 'a', patch = {}) => ({ id, child_id: `child-${id}`, parent_user_id: 'parent', branch_id: 'branch', student_name: `가상 ${id}`, is_sms_enabled: true, academy_student_classes: [], ...patch });
const plan = patch => ({ id: 'plan', effective_month: '2026-11-01', item_type: 'package', status: 'planned', student_id: 'a', package_option_id: 'option', package_options: option(), ...patch });
const owned = patch => ({ id: 'owned', child_id: 'child-a', package_id: 'product', option_id: 'option', package_name: '가상 이용권', price: 3000, total_count: 10, status: 'active', voucher_type: 'lesson', valid_from: '2026-11-01', valid_until: '2026-11-30', ...patch });
const snapshot = patch => ({ activeStudents: [appStudent()], billingPackages: [], planRevisions: [], monthlyPlanRows: [], appAssignments: [], ownedPackages: [], sharedShuttlePackages: [], options: [], issuedBills: [], ...patch });
const calculate = data => buildBillingTargets('2026-11', data);

test('owned passes alone never create a new instruction and students without targets remain on the roster', () => {
  const result = calculate(snapshot({ ownedPackages: [owned()], options: [option()] }));
  assert.deepEqual(result.targets, []);
  assert.equal(result.billingRosterStudents.length, 1);
  assert.equal(result.billingRosterStudents[0].studentId, 'a');
});
test('exact-month legacy plans keep catalog amounts and use effective app classes first', () => {
  const data = snapshot({ monthlyPlanRows: [plan(), plan({ id: 'class-plan', item_type: 'class', class_schedules: { target_class: '과거 계획반' } })], ownedPackages: [owned({ price: 2000 })], options: [option()], appAssignments: [{ child_id: 'child-a', class_schedules: { target_class: '현재 배정반' } }] });
  const before = structuredClone(data);
  const result = calculate(data);
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].price, 3000);
  assert.equal(result.targets[0].hasTargetMonthPackage, true);
  assert.deepEqual(result.targets[0].classNames, ['현재 배정반']);
  assert.deepEqual(data, before);
});
test('different owned option of the same product is flagged rather than silently substituted', () => {
  const result = calculate(snapshot({ monthlyPlanRows: [plan()], ownedPackages: [owned({ option_id: 'actual' })], options: [option('actual')] }));
  assert.equal(result.targets[0].hasTargetMonthPackage, false);
  assert.equal(result.targets[0].entitlementMismatch, true);
  assert.equal(result.targets[0].actualUserPackageId, 'owned');
  assert.equal(result.targets[0].actualOptionId, 'actual');
  assert.equal(result.targets[0].optionId, 'option');
});
test('latest recurring revision is respected and old additional charges do not roll over', () => {
  const result = calculate(snapshot({ planRevisions: [{ student_id: 'a', effective_month: '2026-09-01' }, { student_id: 'a', effective_month: '2026-10-01' }], monthlyPlanRows: [
    plan({ id: 'old-standard', effective_month: '2026-09-01', package_option_id: 'old', package_options: option('old') }),
    plan({ id: 'current-standard', effective_month: '2026-10-01' }),
    plan({ id: 'old-additional', billing_source: 'additional', effective_month: '2026-10-01' }),
    plan({ id: 'new-additional', billing_source: 'additional' }),
  ] }));
  assert.deepEqual(result.targets.map(row => row.userPackageId), ['plan:current-standard', 'plan:new-additional']);
  assert.equal(result.targets[1].isAdditional, true);
});
test('explicit empty revisions do not resurrect old package plans', () => {
  const result = calculate(snapshot({ planRevisions: [{ student_id: 'a', effective_month: '2026-11-01' }], monthlyPlanRows: [plan({ effective_month: '2026-10-01' })], ownedPackages: [owned()] }));
  assert.deepEqual(result.targets, []);
});
test('additional plans keep separate identities even when option IDs match', () => {
  const result = calculate(snapshot({ monthlyPlanRows: [plan(), plan({ id: 'extra-1', billing_source: 'additional' }), plan({ id: 'extra-2', billing_source: 'additional' })], ownedPackages: [owned()], options: [option()] }));
  assert.equal(result.targets.length, 3);
  assert.deepEqual(result.targets.slice(1).map(row => row.hasTargetMonthPackage), [false, false]);
});
test('family-shared shuttle plans appear once with a deterministic student representative', () => {
  const result = calculate(snapshot({ activeStudents: [appStudent('b'), appStudent('a')], monthlyPlanRows: [plan({ id: 'b-plan', student_id: 'b', package_options: option('shuttle', 'shuttle'), package_option_id: 'shuttle' }), plan({ id: 'a-plan', package_options: option('shuttle', 'shuttle'), package_option_id: 'shuttle' })], sharedShuttlePackages: [owned({ id: 'shared', child_id: null, user_id: 'parent', branch_id: 'branch', voucher_type: 'shuttle', option_id: 'shuttle' })], options: [option('shuttle', 'shuttle')] }));
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].studentId, 'a');
  assert.equal(result.targets[0].isShared, true);
  assert.equal(result.targets[0].parentUserId, 'parent');
  assert.equal(result.targets[0].hasTargetMonthPackage, true);
});
test('family shuttle grouping does not merge plans across branches or explicit additional charges', () => {
  const result = calculate(snapshot({ activeStudents: [appStudent(), appStudent('b', { branch_id: 'other' })], monthlyPlanRows: [plan({ package_options: option('shuttle', 'shuttle') }), plan({ id: 'b-plan', student_id: 'b', package_options: option('shuttle', 'shuttle') }), plan({ id: 'extra', billing_source: 'additional', package_options: option('shuttle', 'shuttle') })] }));
  assert.equal(result.targets.length, 3);
});
test('undated active passes count as renewed but single-use prior-month passes do not', () => {
  const undated = calculate(snapshot({ monthlyPlanRows: [plan()], ownedPackages: [owned({ valid_from: null, valid_until: null })], options: [option()] }));
  assert.equal(undated.targets[0].hasTargetMonthPackage, true);
  const oneOff = calculate(snapshot({ monthlyPlanRows: [plan()], ownedPackages: [owned({ total_count: 1, valid_from: '2026-10-01', valid_until: '2026-10-31' })], options: [option()] }));
  assert.equal(oneOff.targets[0].hasTargetMonthPackage, false);
});
test('web students use active class mappings and retain catalog price and billing terms', () => {
  const result = calculate(snapshot({ activeStudents: [appStudent('web', { child_id: null, is_sms_enabled: false, academy_student_classes: [
    { id: 'mapping', status: 'active', package_option_id: 'option', package_options: { label: '웹 옵션', price: '1234', packages: { name: '웹 이용권' } }, class_schedules: { target_class: '웹 수업' }, billing_cycle: '횟수제', payment_day: '매월 5일' },
    { id: 'inactive', status: 'inactive', package_option_id: 'other' },
  ] })] }));
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].price, 1234);
  assert.equal(result.targets[0].billingCycle, '횟수제');
  assert.equal(result.targets[0].isSmsEnabled, false);
  assert.deepEqual(result.targets[0].classNames, ['웹 수업']);
});
test('issued bills restore historical targets with charged amounts and paid status priority', () => {
  const bills = ['unpaid', 'partial', 'paid'].map((status, index) => ({ id: `bill-${index}`, student_id: 'a', package_option_id: 'option', bill_month: '2026-11', amount_due: 2000, status, payment_request_id: `request-${index}`, package_options: option() }));
  const result = calculate(snapshot({ issuedBills: bills, ownedPackages: [owned()], options: [option()] }));
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].userPackageId, 'bill:bill-0');
  assert.equal(result.targets[0].price, 2000);
  assert.equal(result.targets[0].hasTargetMonthPackage, true);
  assert.deepEqual(result.targetBillStatuses['a:option:2026-11'], { status: 'paid', paymentRequestId: 'request-2' });
});
test('inactive bills do not restore targets and GPS is excluded from selectable catalog options', () => {
  const result = calculate(snapshot({ issuedBills: ['cancelled', 'canceled', 'void', 'deleted'].map(status => ({ id: status, status, student_id: 'a', package_option_id: 'option', package_options: option() })), billingPackages: [{ name: 'GPS', voucher_type: 'gps', package_options: [{ id: 'gps' }] }, { name: '수업', voucher_type: 'lesson', package_options: [{ id: 'lesson', price: 100 }] }] }));
  assert.deepEqual(result.targets, []); assert.deepEqual(result.targetBillStatuses, {});
  assert.deepEqual(result.billingPackageOptions.map(row => row.id), ['lesson']);
});

function fixture({ errorAt, rejectAt } = {}) {
  const queries = [];
  const rows = {
    academy_students: [appStudent('a', { child: { deleted_at: null, parent_id: 'actual-parent' }, archived_at: null }), appStudent('removed', { archived_at: '2026-01-01' }), appStudent('gone', { child: { deleted_at: '2026-01-01' }, archived_at: null })],
    packages: [{ id: 'product', branch_id: 'branch', name: '이용권', is_active: true, package_options: [{ id: 'option', price: 3000 }] }],
    academy_student_billing_plan_revisions: [], academy_student_monthly_plans: [plan()], student_schedule_assignments: [],
    user_packages: [owned(), owned({ id: 'shared', child_id: null, user_id: 'actual-parent', voucher_type: 'shuttle' })], package_options: [option()], academy_bills: [],
  };
  const client = { from(table) {
    const index = queries.length; const filters = [];
    const record = { table, filters: [] }; queries.push(record);
    const query = {
      select(columns) { record.columns = columns; return query; },
      eq(column, value) { filters.push(row => row[column] === value); record.filters.push([column, value]); return query; },
      is(column, value) { filters.push(row => (row[column] ?? null) === value); return query; },
      not(column, operator, value) { assert.equal(operator, 'is'); filters.push(row => (row[column] ?? null) !== value); return query; },
      in(column, values) { filters.push(row => values.includes(row[column])); record.filters.push([column, values]); return query; },
      lte(column, value) { filters.push(row => row[column] <= value); return query; },
      or(expression) {
        const match = expression.match(/^(\w+)\.is\.null,\1\.(lte|gte)\.(.+)$/); assert.ok(match);
        const [, column, comparison, date] = match;
        filters.push(row => row[column] == null || (comparison === 'lte' ? row[column] <= date : row[column] >= date)); return query;
      },
      then(resolve, reject) {
        if (index === rejectAt) return Promise.reject(new Error('private detail')).then(resolve, reject);
        return Promise.resolve({ data: rows[table].filter(row => filters.every(filter => filter(row))), error: index === errorAt ? { code: '42501', message: 'private detail' } : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { client, rows, queries };
}
test('target reads preserve filters, actual child ownership and complete snapshot shape', async () => {
  const dependencies = fixture();
  const result = await loadBillingTargetData('branch', '2026-11', dependencies);
  assert.deepEqual(result.billingRosterStudents.map(row => row.studentId), ['a']);
  assert.equal(result.targets[0].hasTargetMonthPackage, true);
  assert.equal(dependencies.queries.length, 9);
  const shared = dependencies.queries.filter(query => query.table === 'user_packages')[1];
  assert.ok(shared.filters.some(([key, value]) => key === 'user_id' && value.includes('actual-parent')));
  assert.ok(shared.filters.some(([key, value]) => key === 'voucher_type' && value === 'shuttle'));
});
for (const branch of [null, 'all', 'branch']) {
  test(`${branch} target reads preserve all-branch and selected-branch behavior`, async () => {
    const dependencies = fixture();
    dependencies.rows.academy_students.push(appStudent('other', { branch_id: 'other', archived_at: null }));
    dependencies.rows.academy_student_monthly_plans.push(plan({ id: 'other-plan', student_id: 'other' }));
    const result = await loadBillingTargetData(branch, '2026-11', dependencies);
    assert.equal(result.targets.some(row => row.studentId === 'other'), branch !== 'branch');
    assert.equal(result.targets.some(row => row.studentId === 'a'), true);
  });
}
test('empty source tables yield one complete empty target snapshot', async () => {
  const dependencies = fixture();
  for (const key of Object.keys(dependencies.rows)) dependencies.rows[key] = [];
  assert.deepEqual(await loadBillingTargetData('branch', '2026-11', dependencies), { billingPackageOptions: [], billingRosterStudents: [], targets: [], targetBillStatuses: {} });
  assert.equal(dependencies.queries.length, 3);
});
for (const errorAt of Array.from({ length: 9 }, (_, index) => index)) {
  test(`target query ${errorAt + 1} failure rejects the whole snapshot without retry`, async () => {
    const dependencies = fixture({ errorAt });
    await assert.rejects(loadBillingTargetData('branch', '2026-11', dependencies), error => error.code === 'PERMISSION_DENIED' && !error.message.includes('private detail'));
    assert.equal(dependencies.queries.length, errorAt + 1);
  });
}
test('target transport failures are normalized without raw details', async () => {
  await assert.rejects(loadBillingTargetData('branch', '2026-11', fixture({ rejectAt: 0 })), error => error.code === 'BILL_LOAD_FAILED' && !error.message.includes('private detail'));
});

const source = readFileSync(new URL('../src/pages/admin/billing/views/AdminBillingTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminBillingTab.tsx', source, ts.ScriptTarget.Latest, true);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadBillingTargets') callback = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function screen(loader) {
  const state = { options: [], roster: [], targets: [], statuses: {}, loading: false, errors: [] };
  const dependencies = {
    useCallback: fn => fn,
    billingReadSequence: { current: 0 }, activeBranchId: 'branch', selectedMonth: '2026-11', supabase: {}, loadBillingTargetData: loader,
    setBillingPackageOptions: value => { state.options = value; }, setBillingRosterStudents: value => { state.roster = value; },
    setBillingTargets: value => { state.targets = value; }, setTargetBillStatuses: value => { state.statuses = value; },
    setLoading: value => { state.loading = value; }, handleError: async (...args) => { state.errors.push(args); },
  };
  const code = ts.transpile(`const callback = ${callback};`, { target: ts.ScriptTarget.ES2022 });
  return { state, run: new Function(...Object.keys(dependencies), `${code}\nreturn callback;`)(...Object.values(dependencies)) };
}
const result = id => ({ billingPackageOptions: [{ id }], billingRosterStudents: [{ id }], targets: [{ id }], targetBillStatuses: { id } });
test('all four target-related lists are published only after the full read resolves', async () => {
  let finish;
  const { state, run } = screen(() => new Promise(resolve => { finish = resolve; }));
  const pending = run(); assert.deepEqual(state.options, []); assert.deepEqual(state.roster, []);
  finish(result('complete')); await pending;
  assert.equal(state.options[0].id, 'complete'); assert.equal(state.targets[0].id, 'complete');
});
test('stale target responses cannot overwrite newer data or release its loading state', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run(); const second = run(); pending[0](result('old')); await first;
  assert.equal(state.loading, true); assert.deepEqual(state.roster, []);
  pending[1](result('new')); await second; assert.equal(state.targets[0].id, 'new'); assert.equal(state.loading, false);
});
test('a failed target read clears the entire snapshot and reports a common error', async () => {
  const { state, run } = screen(async () => { throw new Error('failure'); });
  state.options = state.roster = state.targets = [{ id: 'old' }]; state.statuses = { old: true };
  await run(); assert.deepEqual(state.options, []); assert.deepEqual(state.roster, []); assert.deepEqual(state.targets, []); assert.deepEqual(state.statuses, {}); assert.equal(state.errors.length, 1); assert.equal(state.loading, false);
});
test('a late target failure cannot clear a newer successful snapshot or show an old alert', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = run(); const second = run(); pending[1].resolve(result('new')); await second;
  pending[0].reject(new Error('old failure')); await first;
  assert.equal(state.targets[0].id, 'new'); assert.equal(state.options[0].id, 'new'); assert.deepEqual(state.errors, []);
});
