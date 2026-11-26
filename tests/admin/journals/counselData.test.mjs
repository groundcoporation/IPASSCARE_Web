import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadCounselData } from '../../../src/pages/admin/journals/api/counselData.ts';

const source = readFileSync(new URL('../../../src/pages/admin/journals/views/AdminCounselTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminCounselTab.tsx', source, ts.ScriptTarget.Latest, true);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadData') {
    callback = node.initializer.arguments[0].getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
// Run the actual component callback without a live backend.
function screen(loader) {
  const state = { loading: false, students: [], teachers: [], logs: [], selected: null, errors: [] };
  const dependencies = {
    loadSequence: { current: 0 }, activeBranchId: 'branch', supabase: {},
    loadActiveAppSchedulesByChild() {}, loadCounselData: loader,
    setLoading: value => { state.loading = value; },
    setStudents: value => { state.students = value; },
    setTeachers: value => { state.teachers = value; },
    setCounselLogs: value => { state.logs = value; },
    setSelectedStudentId: value => { state.selected = typeof value === 'function' ? value(state.selected) : value; },
    handleError: error => { state.errors.push(error); },
  };
  const code = ts.transpile(`const callback = ${callback};`, { target: ts.ScriptTarget.ES2022 });
  const run = new Function(...Object.keys(dependencies), `${code}\nreturn callback;`)(...Object.values(dependencies));
  return { state, run };
}

test('a late response cannot overwrite the latest refresh or release its loading state', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run();
  const second = run();
  const snapshot = id => ({ students: [{ id }], teachers: [], counselLogs: [] });
  pending[0](snapshot('old'));
  await first;
  assert.equal(state.loading, true);
  assert.deepEqual(state.students, []);
  pending[1](snapshot('new'));
  await second;
  assert.equal(state.selected, 'new');
  assert.equal(state.loading, false);
});

test('a failed refresh clears stale data, reports an error and releases loading', async () => {
  const { state, run } = screen(async () => { throw new Error('simulated failure'); });
  state.students = [{ id: 'previous' }];
  state.logs = [{ id: 'previous-log' }];
  await run();
  assert.deepEqual(state.students, []);
  assert.deepEqual(state.logs, []);
  assert.equal(state.selected, null);
  assert.equal(state.errors.length, 1);
  assert.equal(state.loading, false);
});

function fixture(failTable) {
  const calls = [];
  const rows = {
    academy_students: [{ id: 'student', child_id: 'child' }, { id: 'manual', child_id: null }],
    academy_teachers: [{ id: 'teacher', name: '가상 담당자' }],
    academy_counsel_logs: [{ id: 'log', student_id: 'student' }],
  };
  const client = { from(table) {
    const query = {
      select() { return query; },
      order(...args) { calls.push([table, 'order', ...args]); return query; },
      eq(...args) { calls.push([table, 'eq', ...args]); return query; },
      then(resolve, reject) {
        return Promise.resolve({ data: rows[table], error: table === failTable ? { code: '42501', message: 'private detail' } : null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { client, calls, loadSchedules: async () => new Map([['child', [{ id: 'schedule' }]]]) };
}

test('complete snapshot keeps branch scope, schedules and manual students', async () => {
  const dependencies = fixture();
  const result = await loadCounselData('branch', dependencies);
  assert.equal(result.students.length, 2);
  assert.deepEqual(result.students[0].app_schedule_classes, [{ id: 'schedule' }]);
  assert.equal(result.students[1].app_schedule_classes, undefined);
  assert.equal(result.teachers.length, 1);
  assert.equal(result.counselLogs.length, 1);
  assert.equal(dependencies.calls.filter(call => call[1] === 'eq' && call[3] === 'branch').length, 3);
});

test('all-branch reads do not add a branch filter', async () => {
  const dependencies = fixture();
  await loadCounselData(null, dependencies);
  assert.equal(dependencies.calls.filter(call => call[1] === 'eq').length, 0);
});

for (const table of ['academy_students', 'academy_teachers', 'academy_counsel_logs']) {
  test(`${table} failure rejects the entire snapshot safely`, async () => {
    await assert.rejects(loadCounselData(null, fixture(table)), error =>
      error.code === 'PERMISSION_DENIED' && !error.message.includes('private detail'));
  });
}

test('schedule failures do not return partial data', async () => {
  const dependencies = fixture();
  dependencies.loadSchedules = async () => { throw new Error('private detail'); };
  await assert.rejects(loadCounselData(null, dependencies), error =>
    error.code === 'JOURNAL_LOAD_FAILED' && !error.message.includes('private detail'));
});

test('empty tables produce empty arrays', async () => {
  const dependencies = fixture();
  dependencies.client.from = () => {
    const query = { select: () => query, order: () => query, then: resolve => Promise.resolve({ data: null, error: null }).then(resolve) };
    return query;
  };
  assert.deepEqual(await loadCounselData(null, dependencies), { students: [], teachers: [], counselLogs: [] });
});
