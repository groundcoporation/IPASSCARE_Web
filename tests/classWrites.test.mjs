import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { prepareClassWrite, isClassId } from '../src/pages/admin/classes/model/classWrite.ts';
import { saveClassRecord, deleteClassRecord } from '../src/pages/admin/classes/api/classWrites.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const id = '11111111-1111-4111-8111-111111111111'; const teacher = '22222222-2222-4222-8222-222222222222';
const form = patch => ({ branchId: 'branch', title: ' Test ', teacherId: teacher, day: '월요일', start: '14:00', end: '15:00', capacity: '20', ...patch });
function mock(reply) {
  const calls = []; let values; const q = {};
  for (const method of ['insert', 'update', 'delete', 'eq', 'is', 'select', 'single']) q[method] = (...args) => { calls.push([method, ...args]); if (method === 'insert') values = args[0][0]; if (method === 'update') values = args[0]; return q; };
  q.then = (yes, no) => Promise.resolve().then(() => { if (reply instanceof Error) throw reply; return reply ?? { data: { ...values, id }, error: null }; }).then(yes, no);
  return { calls, client: { from: table => { calls.push(['from', table]); return q; } } };
}
test('input preparation retains payload fields, trims title and supports optional capacity/teacher', () => {
  assert.deepEqual(prepareClassWrite(form()), { branch_id: 'branch', target_class: 'Test', teacher_id: teacher, day_of_week: '월요일', start_time: '14:00:00', end_time: '15:00:00', max_people: 20, is_active: true });
  const empty = prepareClassWrite(form({ capacity: '', teacherId: '' })); assert.equal(empty.max_people, null); assert.equal(empty.teacher_id, null);
});
test('invalid day/time/capacity/target never starts a write', async () => {
  for (const patch of [{ title: '' }, { branchId: '' }, { day: 'bad' }, { start: '24:00' }, { end: '13:00' }, { end: '14:00' }, { capacity: '0' }, { capacity: '2.5' }, { capacity: '2147483648' }, { teacherId: 'bad' }]) {
    const d = mock(); await assert.rejects(saveClassRecord(form(patch), null, d), e => e.code === 'CLASS_WRITE_INPUT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
test('insert confirms full returned row, updates scope to original branch and ID', async () => {
  const insert = mock(); assert.deepEqual(await saveClassRecord(form(), null, insert), { id }); assert.equal(insert.calls.filter(c => c[0] === 'insert').length, 1);
  const update = mock(); await saveClassRecord(form(), { id, branchId: 'original' }, update); assert.ok(update.calls.some(c => c[0] === 'eq' && c[1] === 'branch_id' && c[2] === 'original'));
  const noBranch = mock(); await saveClassRecord(form(), { id, branchId: null }, noBranch); assert.ok(noBranch.calls.some(c => c[0] === 'is' && c[1] === 'branch_id' && c[2] === null));
});
test('unknown/mismatched write response is not success and never retried', async () => {
  for (const reply of [new Error('private'), { data: null }, { data: { id } }, { data: { ...prepareClassWrite(form()), id, max_people: 1 } }, { data: { ...prepareClassWrite(form()), id: teacher } }]) {
    const d = mock(reply); await assert.rejects(saveClassRecord(form(), { id, branchId: 'branch' }, d), e => e.code === 'CLASS_WRITE_UNCONFIRMED'); assert.equal(d.calls.filter(c => c[0] === 'update').length, 1);
  }
});
test('permission/server errors normalize without fallback writes', async () => {
  for (const code of ['42501', 'PGRST202']) { const d = mock({ error: { code, message: 'private' } }); await assert.rejects(saveClassRecord(form(), null, d), e => e.code === (code === '42501' ? 'PERMISSION_DENIED' : 'SERVER_UPDATE_REQUIRED') && !e.message.includes('private')); assert.equal(d.calls.filter(c => c[0] === 'insert').length, 1); }
});
test('delete keeps hard-delete request but scopes original branch and requires returned deleted ID', async () => {
  const d = mock({ data: { id } }); await deleteClassRecord({ id, branchId: 'branch' }, d); assert.deepEqual(d.calls, [['from', 'class_schedules'], ['delete'], ['eq', 'id', id], ['eq', 'branch_id', 'branch'], ['select', 'id'], ['single']]);
  for (const data of [null, { id: teacher }]) await assert.rejects(deleteClassRecord({ id, branchId: 'branch' }, mock({ data })), e => e.code === 'CLASS_WRITE_UNCONFIRMED');
});
test('invalid deletion ID cannot touch any tables', async () => { const d = mock(); await assert.rejects(deleteClassRecord({ id: 'bad', branchId: null }, d), e => e.code === 'CLASS_WRITE_INPUT_INVALID'); assert.equal(d.calls.length, 0); });
const source = readFileSync(new URL('../src/pages/admin/classes/views/AdminClassTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminClassTab.tsx', source, ts.ScriptTarget.Latest, true); const defs = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) defs.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + defs.get(name) + '; return handler;', { target: ts.ScriptTarget.ES2022 }))(...Object.values(deps)); }
function screen(options = {}) {
  const profile = { id: 'u', role: 'director', branch_id: 'branch' }; const state = { saves: 0, deletes: 0, busy: false, errors: [], closed: 0, reads: 0, ready: true, confirms: [] };
  const deps = { AppError, prepareClassWrite, isClassId, profile, activeBranchId: 'branch', classActiveView: { current: { profile, activeBranchId: 'branch' } }, classFormEpoch: { current: 0 }, classMounted: { current: true }, classReadRequest: { current: 0 }, classWriteInFlight: { current: false }, classReviewRequired: { current: false }, classDataReady: true, loading: false,
    classes: [{ id, branch_id: 'branch' }], branches: [{ id: 'branch' }], teachers: [{ id: teacher, branch_id: 'branch' }], selectedBranchId: 'branch', targetClass: 'Test', teacherId: teacher, dayOfWeek: '월요일', startTime: '14:00', endTime: '15:00', maxPeople: '20', supabase: {},
    setSaveLoading: v => { state.busy = v; }, setClassDataReady: v => { state.ready = v; }, setIsModalOpen: () => { state.closed++; }, handleError: async (e, code) => state.errors.push(e instanceof AppError ? e.code : code), confirm: text => { state.confirms.push(text); return options.confirm !== false; },
    saveClassRecord: async () => { state.saves++; return options.save ? options.save() : { id }; }, deleteClassRecord: async () => { state.deletes++; if (options.remove) await options.remove(); }, loadInitialData: async () => { state.reads++; if (options.refreshError) throw new AppError('CLASS_WRITE_REFRESH_FAILED'); },
  };
  deps.latestClassLoad = { current: deps.loadInitialData };
  return { state, deps, run: (mode = 'save', target = id) => compile('executeClassWrite', deps)(mode, target) };
}
test('confirmed save closes editor then refreshes without optimistic class mutation', async () => { const s = screen(); await s.run(); assert.equal(s.state.saves, 1); assert.equal(s.state.closed, 1); assert.equal(s.state.reads, 1); assert.equal(s.state.busy, false); });
test('shared synchronous lock prevents save/save and save/delete overlap', async () => {
  let finish; const s = screen({ save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); await s.run(); await s.run('delete'); assert.equal(s.state.saves, 1); assert.equal(s.state.deletes, 0); finish({ id }); await pending; assert.equal(s.deps.classWriteInFlight.current, false);
});
test('scope/teacher/branch validation and unready roster never writes', async () => {
  for (const key of ['selectedBranchId', 'teacherId', 'classDataReady']) { const s = screen(); s.deps[key] = key === 'classDataReady' ? false : 'other'; await s.run(); assert.equal(s.state.saves, 0); }
});
test('cancelled deletion does not acquire lock and warns specifically about cascade history', async () => {
  const s = screen({ confirm: false }); await s.run('delete'); assert.equal(s.state.deletes, 0); assert.equal(s.state.busy, false); assert.match(s.state.confirms[0], /청구 이력이 연쇄 삭제/);
});
test('unknown write keeps editor and blocks repeat until explicit fresh read', async () => {
  const s = screen({ save: () => { throw new Error('private'); } }); await s.run(); await s.run(); assert.equal(s.state.saves, 1); assert.equal(s.state.closed, 0); assert.equal(s.state.reads, 0); assert.equal(s.state.ready, false); assert.equal(s.deps.classReviewRequired.current, true);
});
test('refresh failure stays distinct from another write failure', async () => {
  const s = screen({ refreshError: true }); await s.run(); assert.deepEqual(s.state.errors, ['CLASS_WRITE_REFRESH_FAILED']); assert.equal(s.state.saves, 1); assert.equal(s.deps.classReviewRequired.current, true);
});
test('write response after branch/epoch switch cannot close new form and reloads latest scope', async () => {
  let finish; const s = screen({ save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); s.deps.classFormEpoch.current++;
  let latest = 0; s.deps.latestClassLoad.current = async () => { latest++; }; finish({ id }); await pending; assert.equal(s.state.closed, 0); assert.equal(s.state.reads, 0); assert.equal(latest, 1);
});
test('unmount does not start a new query after pending write', async () => {
  let finish; const s = screen({ save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); s.deps.classMounted.current = false; finish({ id }); await pending; assert.equal(s.state.closed, 0); assert.equal(s.state.reads, 0); assert.equal(s.state.busy, false);
});
test('close/backdrop and new editing are blocked during write', () => {
  const s = screen(); s.deps.classWriteInFlight.current = true; compile('closeModal', s.deps)(); assert.equal(s.state.closed, 0);
  assert.match(source, /<fieldset disabled=\{saveLoading \|\| loading \|\| !classDataReady\}/); assert.doesNotMatch(defs.get('executeClassWrite'), /supabase\.from|console\.|\.message/);
});
test('reader cannot overwrite during write and propagates post-write refresh failure once', async () => {
  const s = screen(); const deps = { ...s.deps, useCallback: fn => fn, setLoading() {}, setTeachers() {}, setClasses() {}, loadClassManagementData: async () => { throw new Error('private'); } };
  deps.classWriteInFlight.current = true; await compile('loadInitialData', deps)(); deps.classWriteInFlight.current = false;
  await assert.rejects(compile('loadInitialData', deps)(false), e => e.code === 'CLASS_WRITE_REFRESH_FAILED');
});
test('class write messages match app', () => {
  const app = readFileSync(new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8'); for (const code of ['CLASS_WRITE_INPUT_INVALID', 'CLASS_WRITE_UNCONFIRMED', 'CLASS_WRITE_REFRESH_FAILED']) assert.equal(app.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
