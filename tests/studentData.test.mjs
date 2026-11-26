import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadStudentData } from '../src/pages/admin/students/api/studentData.ts';
import { errorMessages } from '../src/errors/appError.ts';

function fixture({ errorTable, rejectTable, empty = false } = {}) {
  const calls = [];
  const rows = {
    class_schedules: [
      { id: 'plan-class', target_class: '월별 계획반', branch_id: 'a' },
      { id: 'manual-class', target_class: '웹 배정반', branch_id: 'a' },
      { id: 'other-class', target_class: '다른 지점반', branch_id: 'b' },
    ],
    packages: [
      { id: 'lesson', name: '수업권', voucher_type: null, branch_id: 'a', is_active: true, package_options: [{ id: 'option', label: '월 이용', branch_id: null, price: 1000 }] },
      { id: 'inactive', branch_id: 'a', is_active: false, package_options: [{ id: 'hidden' }] },
    ],
    academy_students: [
      { id: 'linked', child_id: 'linked-child', student_name: '연결 원생', parent_user_id: 'parent', mother_phone: '01000001234', attendance_code: 'APP-abcd', branch_id: 'a', archived_at: null, child: { deleted_at: null, back_number: '4321', parent_id: 'actual-parent' }, parent_user: { status: 'active' } },
      { id: 'manual', child_id: null, student_name: '웹 원생', attendance_code: '9876', branch_id: 'a', archived_at: null },
      { id: 'deleted-child', child_id: 'gone-child', branch_id: 'a', archived_at: null, child: { deleted_at: '2026-01-01' } },
      { id: 'deleted-parent', child_id: null, parent_user_id: 'deleted-user', branch_id: 'a', archived_at: null, parent_user: { status: 'deleted' } },
      { id: 'archived', child_id: null, branch_id: 'a', archived_at: '2026-01-01' },
      { id: 'other', child_id: null, branch_id: 'b', archived_at: null },
    ],
    children: [
      { id: 'linked-child', child_name: '중복 원생', parent_id: 'actual-parent', branch_id: 'a', deleted_at: null },
      { id: 'app-child', child_name: '앱 원생', back_number: null, parent_id: 'app-parent', branch_id: 'a', deleted_at: null, created_at: '2026-01-01', parent: { name: '가상 보호자', phone: '01000005678', status: 'active' } },
      { id: 'gone-child', branch_id: 'a', deleted_at: '2026-01-01' },
      { id: 'removed-parent-child', branch_id: 'a', deleted_at: null, parent: { status: 'deleted' } },
    ],
    users: [
      { id: 'parent', role: 'user', status: 'active', branch_id: 'a' },
      { id: 'actual-parent', role: 'user', status: 'active', branch_id: 'a' },
      { id: 'app-parent', role: 'user', status: 'active', branch_id: 'a' },
      { id: 'unregistered', name: '미등록 회원', role: 'user', status: 'active', branch_id: 'a', created_at: '2026-01-01' },
      { id: 'staff', role: 'teacher', status: 'active', branch_id: 'a' },
      { id: 'deleted-user', role: 'user', status: 'deleted', branch_id: 'a' },
    ],
    academy_student_classes: [{ student_id: 'manual', class_schedule_id: 'manual-class', package_option_id: 'option', status: 'active' }],
    academy_student_monthly_plans: [
      { student_id: 'linked', class_schedule_id: 'plan-class', effective_month: '2026-11-01', item_type: 'class', status: 'planned' },
      { student_id: 'linked', class_schedule_id: 'other-class', effective_month: '2026-12-01', item_type: 'class', status: 'planned' },
    ],
    user_packages: [
      { child_id: 'linked-child', package_name: '만료권', valid_until: '2000-01-01', status: 'active', created_at: '2026-11-03' },
      { child_id: 'linked-child', package_name: '사용권', valid_until: '2999-01-01', status: 'active', created_at: '2026-11-02', remaining_count: 3 },
      { child_id: 'linked-child', package_name: '이전권', expiry_date: '2999-01-01', status: 'active', created_at: '2026-11-01' },
      { child_id: 'app-child', package_name: '비활성권', status: 'expired', created_at: '2026-11-04' },
    ],
  };
  const client = { from(table) {
    calls.push([table, 'from']);
    const filters = [];
    const orders = [];
    const query = {
      select(columns) { calls.push([table, 'select', columns]); return query; },
      eq(column, value) { filters.push(row => row[column] === value); calls.push([table, 'eq', column, value]); return query; },
      neq(column, value) { filters.push(row => row[column] !== value); return query; },
      is(column, value) { filters.push(row => (row[column] ?? null) === value); return query; },
      in(column, values) { filters.push(row => values.includes(row[column])); calls.push([table, 'in', column, values]); return query; },
      order(column, options = {}) { orders.push([column, options]); return query; },
      then(resolve, reject) {
        if (table === rejectTable) return Promise.reject(new Error('private detail')).then(resolve, reject);
        const data = empty ? null : rows[table].filter(row => filters.every(filter => filter(row))).sort((a, b) => {
          for (const [column, options] of orders) {
            const comparison = String(a[column] || '').localeCompare(String(b[column] || ''));
            if (comparison) return options.ascending === false ? -comparison : comparison;
          }
          return 0;
        });
        return Promise.resolve({ data, error: table === errorTable ? { code: '42501', message: 'private detail' } : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const loadSchedules = async ids => {
    calls.push(['schedules', ids]);
    return new Map([
      ['linked-child', [{ id: 'app-class', target_class: '앱 배정반' }]],
      ['app-child', [{ id: 'app-only-class', target_class: '앱 전용반' }]],
    ]);
  };
  return { client, loadSchedules, calls, rows };
}

test('merges app/web students without duplicates and preserves course, package and parent rules', async () => {
  const dependencies = fixture();
  const result = await loadStudentData('a', '2026-11', dependencies);
  assert.deepEqual(result.students.map(student => student.id), ['linked', 'manual', 'child-app-child']);
  const [linked, manual, app] = result.students;
  assert.equal(linked.attendance_code, '4321');
  assert.equal(linked.parent_user_id, 'actual-parent');
  assert.equal(linked.app_schedule_classes[0].id, 'plan-class');
  assert.equal(linked.active_package.package_name, '사용권');
  assert.equal(manual.attendance_code, '9876');
  assert.equal(manual.app_schedule_classes, undefined);
  assert.equal(manual.academy_student_classes[0].class_schedules.target_class, '웹 배정반');
  assert.equal(app.attendance_code, '5678');
  assert.equal(app.app_schedule_classes[0].id, 'app-only-class');
  assert.equal(app.active_package, null);
  assert.deepEqual(result.unregisteredMembers.map(member => member.id), ['unregistered']);
  assert.equal(result.packageOptions.length, 1);
  assert.equal(result.packageOptions[0].package_id, 'lesson');
  assert.equal(result.packageOptions[0].branch_id, 'a');
  assert.equal(result.packageOptions[0].packages.voucher_type, 'lesson');
  assert.equal(result.classes.length, 2);
});

for (const branch of [null, 'all']) {
  test(`${branch} preserves the existing all-branch query behavior`, async () => {
    const dependencies = fixture();
    const result = await loadStudentData(branch, '2026-11', dependencies);
    assert.equal(result.students.some(student => student.id === 'other'), true);
    assert.equal(dependencies.calls.some(call => call[1] === 'eq' && call[2] === 'branch_id'), false);
  });
}

test('an empty roster skips ID-dependent class/package queries', async () => {
  const dependencies = fixture({ empty: true });
  assert.deepEqual(await loadStudentData('a', '2026-11', dependencies), { students: [], classes: [], packageOptions: [], unregisteredMembers: [] });
  assert.equal(dependencies.calls.some(call => ['academy_student_classes', 'academy_student_monthly_plans', 'user_packages'].includes(call[0])), false);
});

for (const errorTable of ['class_schedules', 'packages', 'academy_students', 'children', 'users', 'academy_student_classes', 'academy_student_monthly_plans', 'user_packages']) {
  test(`${errorTable} failures reject the complete roster without retries`, async () => {
    const dependencies = fixture({ errorTable });
    await assert.rejects(loadStudentData('a', '2026-11', dependencies), error =>
      error.code === 'PERMISSION_DENIED' && !error.message.includes('private detail'));
    assert.equal(dependencies.calls.filter(call => call[0] === errorTable && call[1] === 'from').length, 1);
  });
}

test('rejected queries and schedule failures use a safe domain error', async () => {
  await assert.rejects(loadStudentData('a', '2026-11', fixture({ rejectTable: 'children' })), error =>
    error.code === 'STUDENT_LOAD_FAILED' && !error.message.includes('private detail'));
  const dependencies = fixture();
  dependencies.loadSchedules = async () => { throw new Error('private detail'); };
  await assert.rejects(loadStudentData('a', '2026-11', dependencies), error =>
    error.code === 'STUDENT_LOAD_FAILED' && !error.message.includes('private detail'));
});

const appCatalog = new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('student read error message is synchronized with the app catalog', { skip: !existsSync(appCatalog) }, () => {
  const match = readFileSync(appCatalog, 'utf8').match(/STUDENT_LOAD_FAILED:\s*"([^"]+)"/);
  assert.equal(match?.[1], errorMessages.STUDENT_LOAD_FAILED);
});

const source = readFileSync(new URL('../src/pages/admin/students/views/AdminStudentTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudentTab.tsx', source, ts.ScriptTarget.Latest, true);
let callback;
let effect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadData') callback = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0].getText(ast).includes('loadSequence.current')) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function screen(loader) {
  const state = { students: [], classes: [], packageOptions: [], members: [], loading: false, errors: [] };
  const dependencies = {
    useCallback: fn => fn,
    loadSequence: { current: 0 }, activeBranchId: 'a', currentBillMonth: () => '2026-11', supabase: {}, loadActiveAppSchedulesByChild() {}, loadStudentData: loader,
    setStudents: value => { state.students = value; }, setClasses: value => { state.classes = value; },
    setPackageOptions: value => { state.packageOptions = value; }, setUnregisteredMembers: value => { state.members = value; },
    setLoading: value => { state.loading = value; }, handleError: async (...args) => { state.errors.push(args); }, loadWithdrawals() {},
  };
  const code = ts.transpile(`const loadData = ${callback}; const effect = ${effect};`, { target: ts.ScriptTarget.ES2022 });
  return { state, ...new Function(...Object.keys(dependencies), `${code}\nreturn { run: loadData, mount: effect };`)(...Object.values(dependencies)) };
}
const snapshot = id => ({ students: [{ id }], classes: [{ id }], packageOptions: [{ id }], unregisteredMembers: [{ id }] });

test('explicit refresh callers can receive errors without a duplicate screen alert', async () => {
  const failure = new Error('simulated failure');
  const { state, run } = screen(async () => { throw failure; });
  await assert.rejects(run(false), error => error === failure);
  assert.deepEqual(state.errors, []);
  assert.equal(state.loading, false);
});

test('refresh callers receive fresh records and stale editor predicates prevent state updates', async () => {
  const data = snapshot('fresh');
  const { state, run } = screen(async () => data);
  assert.equal(await run(false), data);
  state.students = [];
  assert.equal(await run(false, () => false), undefined);
  assert.deepEqual(state.students, []);
});

test('only the latest roster response can update the screen', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run(); const second = run();
  pending[1](snapshot('new')); await second;
  pending[0](snapshot('old')); await first;
  assert.equal(state.students[0].id, 'new');
  assert.equal(state.classes[0].id, 'new');
  assert.equal(state.loading, false);
});

test('a stale failure cannot clear newer data or show an outdated alert', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = run(); const second = run();
  pending[1].resolve(snapshot('new')); await second;
  pending[0].reject(new Error('old error')); await first;
  assert.equal(state.students[0].id, 'new');
  assert.deepEqual(state.errors, []);
});

test('failed reads clear all lists and release loading through the common handler', async () => {
  const { state, run } = screen(async () => { throw new Error('failure'); });
  state.students = state.classes = state.packageOptions = state.members = [{ id: 'old' }];
  await run();
  for (const field of ['students', 'classes', 'packageOptions', 'members']) assert.deepEqual(state[field], []);
  assert.equal(state.loading, false);
  assert.equal(state.errors[0][1], 'STUDENT_LOAD_FAILED');
});

test('old requests cannot release the current loading state', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run(); const second = run();
  pending[0](snapshot('old')); await first;
  assert.equal(state.loading, true);
  pending[1](snapshot('new')); await second;
  assert.equal(state.loading, false);
});

test('effect cleanup invalidates a response after branch change or unmount', async () => {
  let finish;
  const { state, mount } = screen(() => new Promise(resolve => { finish = resolve; }));
  const cleanup = mount(); cleanup();
  finish(snapshot('late'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state.students, []);
  assert.deepEqual(state.errors, []);
});
