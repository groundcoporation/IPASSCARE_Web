import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadStudyData } from '../../../src/pages/admin/journals/api/studyData.ts';

function fixture({ failTable, rejectTable, empty = false } = {}) {
  const calls = [];
  const manualClasses = [{ class_schedules: { id: 'manual-class', target_class: '수동 배정반' } }];
  const rows = {
    academy_students: [
      { id: 'app', child_id: 'child', branch_id: 'branch-a' },
      { id: 'manual', child_id: null, branch_id: 'branch-a', academy_student_classes: manualClasses },
      { id: 'other', child_id: 'other-child', branch_id: 'branch-b' },
    ],
    academy_teachers: [{ id: 'teacher-a', branch_id: 'branch-a', name: '가상 담당자' }, { id: 'teacher-b', branch_id: 'branch-b' }],
    academy_study_logs: [
      { id: 'individual', student_id: 'app', branch_id: 'branch-a', is_parent_visible: false },
      { id: 'legacy', student_id: null, branch_id: 'branch-a', is_parent_visible: true },
      { id: 'other-log', student_id: 'other', branch_id: 'branch-b' },
    ],
  };
  const client = { from(table) {
    const filters = [];
    const query = {
      select(columns) { calls.push([table, 'select', columns]); return query; },
      order(...args) { calls.push([table, 'order', ...args]); return query; },
      eq(column, value) { filters.push([column, value]); calls.push([table, 'eq', column, value]); return query; },
      then(resolve, reject) {
        if (table === rejectTable) return Promise.reject(new Error('private server detail')).then(resolve, reject);
        return Promise.resolve({
          data: empty ? null : rows[table].filter(row => filters.every(([column, value]) => row[column] === value)),
          error: table === failTable ? { code: '42501', message: 'private server detail' } : null,
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  const loadSchedules = async childIds => {
    calls.push(['schedules', childIds]);
    return new Map([['child', [{ id: 'app-class', target_class: '앱 배정반' }]]]);
  };
  return { client, loadSchedules, calls, rows };
}

test('study reads retain branch scope, app/manual schedules and legacy class-wide logs', async () => {
  const dependencies = fixture();
  const result = await loadStudyData('branch-a', dependencies);
  assert.deepEqual(result.students.map(student => student.id), ['app', 'manual']);
  assert.deepEqual(result.students[0].app_schedule_classes, [{ id: 'app-class', target_class: '앱 배정반' }]);
  assert.equal(result.students[1].app_schedule_classes, undefined);
  assert.deepEqual(result.students[1].academy_student_classes, dependencies.rows.academy_students[1].academy_student_classes);
  assert.deepEqual(result.teachers.map(teacher => teacher.id), ['teacher-a']);
  assert.deepEqual(result.logs.map(log => log.id), ['individual', 'legacy']);
  assert.equal(result.logs[1].student_id, null);
  assert.equal(result.logs[0].is_parent_visible, false);
  assert.equal(result.logs[1].is_parent_visible, true);
  assert.deepEqual(dependencies.calls.find(call => call[0] === 'schedules'), ['schedules', ['child']]);
  assert.equal(dependencies.calls.filter(call => call[1] === 'eq' && call[2] === 'branch_id').length, 3);
  assert.deepEqual(dependencies.calls.filter(call => call[0] === 'academy_study_logs' && call[1] === 'order'), [
    ['academy_study_logs', 'order', 'lesson_date', { ascending: false }],
    ['academy_study_logs', 'order', 'created_at', { ascending: false }],
  ]);
});

test('all-branch reads preserve records without adding a branch filter', async () => {
  const dependencies = fixture();
  const result = await loadStudyData(null, dependencies);
  assert.equal(result.students.length, 3);
  assert.equal(result.teachers.length, 2);
  assert.equal(result.logs.length, 3);
  assert.equal(dependencies.calls.filter(call => call[1] === 'eq').length, 0);
  assert.deepEqual(result.students[2].app_schedule_classes, []);
});

test('empty responses return empty arrays', async () => {
  assert.deepEqual(await loadStudyData(null, fixture({ empty: true })), { students: [], teachers: [], logs: [] });
});

for (const table of ['academy_students', 'academy_teachers', 'academy_study_logs']) {
  test(`${table} permission failure rejects the complete snapshot without retry`, async () => {
    const dependencies = fixture({ failTable: table });
    await assert.rejects(loadStudyData(null, dependencies), error =>
      error.code === 'PERMISSION_DENIED' && !error.message.includes('private server detail'));
    assert.equal(dependencies.calls.filter(call => call[0] === table && call[1] === 'select').length, 1);
    assert.equal(dependencies.calls.some(call => call[0] === 'schedules'), false);
  });
}

test('rejected queries are normalized and never return partial records', async () => {
  await assert.rejects(loadStudyData(null, fixture({ rejectTable: 'academy_teachers' })), error =>
    error.code === 'JOURNAL_LOAD_FAILED' && !error.message.includes('private server detail'));
});

test('schedule failures are normalized and never return partial records', async () => {
  const dependencies = fixture();
  dependencies.loadSchedules = async () => { throw { code: '42501', message: 'private server detail' }; };
  await assert.rejects(loadStudyData(null, dependencies), error =>
    error.code === 'PERMISSION_DENIED' && !error.message.includes('private server detail'));
});

// Exercise the component's real load callback and effect cleanup, without mounting UI or connecting to Supabase.
const source = readFileSync(new URL('../../../src/pages/admin/journals/views/AdminStudyTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudyTab.tsx', source, ts.ScriptTarget.Latest, true);
let callback;
let effect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadData') {
    callback = node.initializer.arguments[0].getText(ast);
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[0].getText(ast).includes('loadSequence.current')) {
    effect = node.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function screen(loader) {
  const state = { students: [], teachers: [], logs: [], selected: '', loading: false, errors: [] };
  const dependencies = {
    loadSequence: { current: 0 }, activeBranchId: 'branch-a', supabase: {},
    loadActiveAppSchedulesByChild() {}, loadStudyData: loader,
    setStudents: value => { state.students = value; },
    setTeachers: value => { state.teachers = value; },
    setLogs: value => { state.logs = value; },
    setStudentId: value => { state.selected = typeof value === 'function' ? value(state.selected) : value; },
    setLoading: value => { state.loading = value; },
    handleError: async (...args) => { state.errors.push(args); },
  };
  const code = ts.transpile(`const loadData = ${callback}; const effect = ${effect};`, { target: ts.ScriptTarget.ES2022 });
  const { loadData: run, effect: mount } = new Function(...Object.keys(dependencies), `${code}\nreturn { loadData, effect };`)(...Object.values(dependencies));
  return { state, run, mount };
}
const snapshot = id => ({ students: [{ id }], teachers: [{ id: 'teacher' }], logs: [{ id: 'log' }] });

test('student selection is preserved on refresh and falls back when missing', async () => {
  const { state, run } = screen(async () => snapshot('student'));
  state.selected = 'student';
  await run();
  assert.equal(state.selected, 'student');
  state.selected = 'not-in-branch';
  await run();
  assert.equal(state.selected, 'student');
});

test('the latest response wins even if the previous response arrives afterwards', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run();
  const second = run();
  pending[1](snapshot('new'));
  await second;
  pending[0](snapshot('old'));
  await first;
  assert.equal(state.selected, 'new');
  assert.equal(state.loading, false);
  assert.deepEqual(state.errors, []);
});

test('stale failures cannot clear the newer data or show an outdated alert', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = run();
  const second = run();
  pending[1].resolve(snapshot('new'));
  await second;
  pending[0].reject(new Error('old failure'));
  await first;
  assert.equal(state.selected, 'new');
  assert.deepEqual(state.errors, []);
});

test('current failures clear all old lists and selection and release loading', async () => {
  const { state, run } = screen(async () => { throw new Error('simulated failure'); });
  state.students = [{ id: 'old-student' }];
  state.teachers = [{ id: 'old-teacher' }];
  state.logs = [{ id: 'old-log' }];
  state.selected = 'old-student';
  await run();
  assert.deepEqual(state.students, []);
  assert.deepEqual(state.teachers, []);
  assert.deepEqual(state.logs, []);
  assert.equal(state.selected, '');
  assert.equal(state.loading, false);
  assert.equal(state.errors.length, 1);
  assert.equal(state.errors[0][1], 'JOURNAL_LOAD_FAILED');
});

test('empty snapshots clear selection without an error', async () => {
  const { state, run } = screen(async () => ({ students: [], teachers: [], logs: [] }));
  state.selected = 'old-student';
  await run();
  assert.equal(state.selected, '');
  assert.equal(state.loading, false);
  assert.deepEqual(state.errors, []);
});

test('an invalidated request cannot release the next request loading indicator', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run();
  const second = run();
  pending[0](snapshot('old'));
  await first;
  assert.equal(state.loading, true);
  pending[1](snapshot('new'));
  await second;
  assert.equal(state.loading, false);
});

test('effect cleanup invalidates a pending response on unmount or branch change', async () => {
  let finish;
  const { state, mount } = screen(() => new Promise(resolve => { finish = resolve; }));
  const cleanup = mount();
  cleanup();
  finish(snapshot('late'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state.students, []);
  assert.deepEqual(state.teachers, []);
  assert.deepEqual(state.logs, []);
  assert.deepEqual(state.errors, []);
});
