import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadClassManagementData } from '../../../src/pages/admin/classes/api/classManagementReads.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';
function mock(patch = {}) {
  const calls = []; const rows = { users: [], academy_teachers: [], class_schedules: [], ...patch };
  return { calls, client: { from(table) { const q = {}; calls.push([table, 'from']);
    for (const method of ['select', 'in', 'eq']) q[method] = (...args) => { calls.push([table, method, ...args]); return q; };
    q.then = (yes, no) => Promise.resolve().then(() => { const result = rows[table]; if (result instanceof Error) throw result; return Array.isArray(result) ? { data: result, error: null } : result; }).then(yes, no); return q;
  } } };
}
test('class management keeps table sequence, role set, branch filters and class join', async () => {
  const d = mock(); assert.deepEqual(await loadClassManagementData('branch', d), { teachers: [], classes: [] });
  assert.deepEqual(d.calls.filter(c => c[1] === 'from').map(c => c[0]), ['users', 'academy_teachers', 'class_schedules']);
  assert.deepEqual(d.calls.find(c => c[1] === 'in'), ['users', 'in', 'role', ['teacher', 'coach', 'director']]);
  assert.equal(d.calls.filter(c => c[1] === 'eq' && c[2] === 'branch_id' && c[3] === 'branch').length, 3);
  assert.ok(d.calls.some(c => c[0] === 'class_schedules' && c[1] === 'select' && c[2].includes('academy_teachers(name)')));
});
test('admin null scope retains all-branch behavior while invalid branches cannot read', async () => {
  const d = mock(); await loadClassManagementData(null, d); assert.equal(d.calls.some(c => c[1] === 'eq'), false);
  for (const branch of ['', 'all']) { const invalid = mock(); await assert.rejects(loadClassManagementData(branch, invalid), e => e.code === 'INPUT_INVALID'); assert.equal(invalid.calls.length, 0); }
});
for (const [index, table] of ['users', 'academy_teachers', 'class_schedules'].entries()) {
  test(table + ' response error stops remaining reads without partial/default results', async () => {
    const d = mock({ [table]: { data: [], error: { code: '42501', message: 'private' } } }); await assert.rejects(loadClassManagementData('branch', d), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private'));
    assert.equal(d.calls.filter(c => c[1] === 'from').length, index + 1);
  });
  test(table + ' malformed or lost response is not empty success and has no retry', async () => {
    for (const result of [{ data: null }, new Error('private')]) { const d = mock({ [table]: result }); await assert.rejects(loadClassManagementData('branch', d), e => e.code === 'CLASS_MANAGEMENT_LOAD_FAILED'); assert.equal(d.calls.filter(c => c[0] === table && c[1] === 'from').length, 1); }
  });
}
test('teacher source priority/id/name duplicate rule and fallback name are preserved', async () => {
  const r = await loadClassManagementData(null, mock({ users: [{ id: 'u', name: 'same', branch_id: 'a' }, { id: 'unnamed', name: null, branch_id: 'a' }], academy_teachers: [{ id: 'u', name: 'other', branch_id: 'a' }, { id: 'custom', name: 'same', branch_id: 'b' }, { id: 'new', name: 'new name', branch_id: 'b' }] }));
  assert.deepEqual(r.teachers.map(x => x.id), ['u', 'unnamed', 'new']); assert.equal(r.teachers[1].name, '이름 없음');
});
test('class teacher join object/array/empty is normalized without mutating source rows', async () => {
  const rows = [{ id: 'a', academy_teachers: { name: 'A' } }, { id: 'b', academy_teachers: [{ name: 'B' }] }, { id: 'c', academy_teachers: [] }]; const original = JSON.stringify(rows);
  const r = await loadClassManagementData('branch', mock({ class_schedules: rows })); assert.equal(r.classes[0].academy_teachers.name, 'A'); assert.equal(r.classes[1].academy_teachers.name, 'B'); assert.equal(r.classes[2].academy_teachers, null); assert.equal(JSON.stringify(rows), original);
});
const source = readFileSync(new URL('../../../src/pages/admin/classes/views/AdminClassTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminClassTab.tsx', source, ts.ScriptTarget.Latest, true); const vars = new Map(); let effect;
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) vars.set(n.name.getText(ast), n.initializer.getText(ast)); if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') effect = n.arguments[0].getText(ast); ts.forEachChild(n, visit); } visit(ast);
function screen(read) {
  const state = { teachers: null, classes: null, ready: false, busy: [], errors: [], reads: [], modal: true }; const profile = { id: 'u', role: 'director', branch_id: 'own' };
  const deps = { AppError, useCallback: fn => fn, profile, activeBranchId: 'filter', classMounted: { current: true }, classFormEpoch: { current: 0 }, classWriteInFlight: { current: false }, classReviewRequired: { current: false }, classReadRequest: { current: 0 }, classActiveView: { current: { profile, activeBranchId: 'filter' } }, supabase: {},
    setLoading: v => state.busy.push(v), setClassDataReady: v => { state.ready = v; }, setTeachers: v => { state.teachers = v; }, setClasses: v => { state.classes = v; }, setIsModalOpen: v => { state.modal = v; },
    loadClassManagementData: async (...args) => { state.reads.push(args); return read ? read() : { teachers: [{ id: 't' }], classes: [{ id: 's' }] }; }, handleError: async (e, code) => state.errors.push(e instanceof AppError ? e.code : code),
  };
  const compile = () => new Function(...Object.keys(deps), ts.transpile(`const loadInitialData = ${vars.get('loadInitialData')}; const effect = ${effect}; return { run: loadInitialData, mount: effect };`, { target: ts.ScriptTarget.ES2022 }))(...Object.values(deps));
  return { state, deps, compile, run: () => compile().run() };
}
test('current complete result applies classes/teachers and ready state together', async () => {
  const s = screen(); await s.run(); assert.equal(s.state.classes[0].id, 's'); assert.equal(s.state.teachers[0].id, 't'); assert.equal(s.state.ready, true); assert.deepEqual(s.state.busy, [true, false]); assert.equal(s.state.reads[0][0], 'own');
});
test('failure clears both lists/readiness and closes stale editor', async () => {
  const s = screen(() => { throw new Error('private'); }); await s.run(); assert.deepEqual(s.state.classes, []); assert.deepEqual(s.state.teachers, []); assert.equal(s.state.ready, false); assert.equal(s.state.modal, false); assert.deepEqual(s.state.errors, ['CLASS_MANAGEMENT_LOAD_FAILED']);
});
test('older successful/failing request cannot overwrite new lists or loading', async () => {
  for (const error of [false, true]) { let finish, fail; const s = screen(() => new Promise((yes, no) => { finish = yes; fail = no; })); const pending = s.run(); s.deps.classReadRequest.current++;
    if (error) fail(new Error('private')); else finish({ teachers: [], classes: [] }); await pending; assert.equal(s.state.classes, null); assert.equal(s.state.teachers, null); assert.deepEqual(s.state.errors, []); assert.deepEqual(s.state.busy, [true]);
  }
});
test('scope change/unmount clears editor/readiness and invalidates response', async () => {
  let finish; const s = screen(() => new Promise(yes => { finish = yes; })); const cleanup = s.compile().mount(); cleanup(); finish({ teachers: [], classes: [] }); await new Promise(resolve => setImmediate(resolve)); assert.equal(s.state.classes, null); assert.equal(s.state.modal, false); assert.equal(s.state.ready, false);
});
test('late callback from prior branch/account cannot begin fresh query', async () => {
  for (const key of ['activeBranchId', 'profile']) { const s = screen(); s.deps.classActiveView.current[key] = key === 'profile' ? { id: 'other' } : 'other'; await s.run(); assert.equal(s.state.reads.length, 0); }
});
test('missing auth/branch or unsupported role cannot widen to all', async () => {
  for (const condition of ['auth', 'branch', 'role']) { const s = screen(); if (condition === 'auth') s.deps.profile.id = ''; if (condition === 'branch') s.deps.profile.branch_id = null; if (condition === 'role') s.deps.profile.role = 'user'; await s.run(); assert.equal(s.state.reads.length, 0); assert.equal(s.state.errors.length, 1); }
});
test('admin reads selected branch or explicit all', async () => {
  const s = screen(); s.deps.profile.role = 'admin'; await s.run(); assert.equal(s.state.reads[0][0], 'filter');
  s.deps.activeBranchId = 'all'; s.deps.classActiveView.current.activeBranchId = 'all'; await s.run(); assert.equal(s.state.reads[1][0], null);
});
test('query callback/effect and controls use readiness without inline queries/raw errors', () => {
  assert.match(vars.get('loadInitialData'), /^useCallback\(/); assert.match(source, /\[loadInitialData\]/); assert.doesNotMatch(vars.get('loadInitialData'), /supabase\.from|console\.|\.message/);
  assert.match(source, /disabled=\{saveLoading \|\| loading \|\| !classDataReady\}/);
  const parent = readFileSync(new URL('../../../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8'); assert.match(parent, /<AdminClassTab activeBranchId=\{activeBranchId\} branches=\{branches\} profile=\{profile\}/);
});
test('class read error message matches app', () => {
  const app = readFileSync(new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8'); assert.equal(app.match(/CLASS_MANAGEMENT_LOAD_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.CLASS_MANAGEMENT_LOAD_FAILED);
});
