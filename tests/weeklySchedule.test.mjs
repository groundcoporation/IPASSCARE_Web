import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadWeeklySchedule } from '../src/pages/admin/classes/api/weeklySchedule.ts';
import { activeScheduleReservations, assembleWeeklySchedule } from '../src/pages/admin/classes/model/weeklySchedule.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const schedule = { id: 'schedule', branch_id: 'branch', target_class: 'test', day_of_week: '월', start_time: '14:00', end_time: '15:00', max_people: 10, branches: [{ name: 'test branch' }] };
const reservation = patch => ({ id: 'r1', schedule_id: 'schedule', class_date: '2026-11-23', status: 'confirmed', attendance_status: 'yet', branch_id: 'branch', child_id: 'child', user_id: 'parent', ...patch });
function mock(patch = {}) {
  const calls = [];
  const rows = { class_schedules: [schedule], reservations: [reservation()], children: [{ id: 'child', child_name: 'test child' }], users: [{ id: 'parent', name: 'test parent', phone: 'synthetic' }], ...patch };
  return { calls, client: { from(table) {
    const q = {}; calls.push([table, 'from']);
    for (const method of ['select', 'eq', 'order', 'is', 'gte', 'lte', 'in', 'neq']) q[method] = (...args) => { calls.push([table, method, ...args]); return q; };
    q.then = (yes, no) => Promise.resolve().then(() => { const value = rows[table]; if (value instanceof Error) throw value; return Array.isArray(value) ? { data: value, error: null } : value; }).then(yes, no);
    return q;
  } } };
}
test('service preserves branch, active/deleted filters, week range and sorting without writes', async () => {
  const d = mock(); const r = await loadWeeklySchedule('branch', '2026-11-23', '2026-11-29', d);
  assert.equal(r.schedules[0].branches.name, 'test branch'); assert.equal(r.reservations[0].children.child_name, 'test child');
  for (const table of ['class_schedules', 'reservations']) assert.ok(d.calls.some(c => c[0] === table && c[1] === 'eq' && c[2] === 'branch_id' && c[3] === 'branch'));
  assert.ok(d.calls.some(c => c[0] === 'class_schedules' && c[1] === 'eq' && c[2] === 'is_active' && c[3] === true));
  assert.ok(d.calls.some(c => c[0] === 'reservations' && c[1] === 'gte' && c[3] === '2026-11-23'));
  assert.ok(d.calls.some(c => c[0] === 'reservations' && c[1] === 'lte' && c[3] === '2026-11-29'));
  assert.ok(d.calls.some(c => c[0] === 'children' && c[1] === 'is' && c[2] === 'deleted_at'));
  assert.ok(d.calls.some(c => c[0] === 'users' && c[1] === 'neq' && c[2] === 'status' && c[3] === 'deleted'));
});
test('null branch retains admin all-branch read', async () => {
  const d = mock(); await loadWeeklySchedule(null, '2026-11-23', '2026-11-29', d);
  assert.equal(d.calls.some(c => c[1] === 'eq' && c[2] === 'branch_id'), false);
});
for (const table of ['class_schedules', 'reservations', 'children', 'users']) test(table + ' response error rejects the complete dataset safely', async () => {
  const d = mock({ [table]: { data: [], error: { code: '42501', message: 'private token' } } });
  await assert.rejects(loadWeeklySchedule('branch', '2026-11-23', '2026-11-29', d), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private'));
});
for (const table of ['class_schedules', 'reservations', 'children', 'users']) test(table + ' malformed response does not become empty success', async () => {
  const d = mock({ [table]: { data: null, error: null } });
  await assert.rejects(loadWeeklySchedule('branch', '2026-11-23', '2026-11-29', d), e => e.code === 'SCHEDULE_LOAD_FAILED');
});
test('network loss is normalized and not retried', async () => {
  const d = mock({ class_schedules: new Error('private') }); await assert.rejects(loadWeeklySchedule('branch', '2026-11-23', '2026-11-29', d), e => e.code === 'SCHEDULE_LOAD_FAILED');
  assert.equal(d.calls.filter(c => c[0] === 'class_schedules' && c[1] === 'from').length, 1);
});
test('invalid branches/date ranges cannot start a query', async () => {
  for (const args of [['all', '2026-11-23', '2026-11-29'], ['', '2026-11-23', '2026-11-29'], ['branch', '2026-02-30', '2026-03-08'], ['branch', '2026-11-29', '2026-11-23'], ['branch', '2026-11-23', '2026-11-30'], ['branch', '', '']]) {
    const d = mock(); await assert.rejects(loadWeeklySchedule(...args, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
test('cancelled statuses are excluded before dependent people queries', async () => {
  const rows = ['cancelled', 'canceled', '취소', '취소요청', 'cancel_requested'].map(status => reservation({ status }));
  assert.deepEqual(activeScheduleReservations(rows), []);
  const d = mock({ reservations: rows }); const r = await loadWeeklySchedule('branch', '2026-11-23', '2026-11-29', d);
  assert.deepEqual(r.reservations, []); assert.equal(d.calls.filter(c => c[1] === 'from').length, 2);
});
test('dependent IDs are deduplicated without changing reservation order', async () => {
  const d = mock({ reservations: [reservation(), reservation({ id: 'r2' })] }); const r = await loadWeeklySchedule('branch', '2026-11-23', '2026-11-29', d);
  assert.deepEqual(d.calls.find(c => c[0] === 'children' && c[1] === 'in'), ['children', 'in', 'id', ['child']]);
  assert.deepEqual(r.reservations.map(x => x.id), ['r1', 'r2']);
});
test('missing or deleted related people hide reservations but optional null links are retained', () => {
  const r = assembleWeeklySchedule([schedule], [reservation(), reservation({ id: 'null-links', child_id: null, user_id: null })], [], []);
  assert.deepEqual(r.reservations.map(x => x.id), ['null-links']); assert.equal(r.reservations[0].users, null);
});
test('relation normalization keeps first branch and never mutates inputs', () => {
  const schedules = [schedule, { ...schedule, id: 'empty', branches: [] }, { ...schedule, id: 'object', branches: { name: 'direct' } }];
  const rows = [reservation()]; const before = JSON.stringify([schedules, rows]); const r = assembleWeeklySchedule(schedules, rows, [], []);
  assert.equal(r.schedules[0].branches.name, 'test branch'); assert.equal(r.schedules[1].branches, null); assert.equal(r.schedules[2].branches.name, 'direct'); assert.equal(JSON.stringify([schedules, rows]), before);
});
const source = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }) + '\nreturn handler;')(...Object.values(deps)); }
function screen(read) {
  const state = { schedules: null, reservations: null, errors: [], busy: [], reads: 0 };
  const deps = { AppError, useCallback: fn => fn, profile: { role: 'director', branch_id: 'branch' }, branchFilter: 'branch', scopedBranchId: p => p.branch_id,
    weekStart: new Date(2026, 10, 23), localDate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    scheduleReadRequest: { current: 0 }, supabase: {}, setLoading: v => state.busy.push(v), setError: () => {}, setSchedules: v => { state.schedules = v; }, setScheduleReservations: v => { state.reservations = v; },
    loadWeeklySchedule: async (...args) => { state.reads++; return read ? read(...args) : { schedules: [schedule], reservations: [reservation()] }; },
    handleError: async (e, fallback) => state.errors.push(e instanceof AppError ? e.code : fallback),
  };
  return { state, deps, run: () => compile('loadSchedules', deps)() };
}
test('screen applies both successful datasets and releases loading', async () => {
  const s = screen((branch, from, to) => { assert.equal(branch, 'branch'); assert.equal(from, '2026-11-23'); assert.equal(to, '2026-11-29'); return { schedules: [schedule], reservations: [reservation()] }; });
  await s.run(); assert.equal(s.state.schedules.length, 1); assert.equal(s.state.reservations.length, 1); assert.deepEqual(s.state.busy, [true, false]);
});
test('unscoped non-admin cannot read all branches', async () => {
  const s = screen(); s.deps.profile.branch_id = null; await s.run(); assert.equal(s.state.reads, 0); assert.deepEqual(s.state.errors, ['PERMISSION_DENIED']); assert.deepEqual(s.state.schedules, []); assert.deepEqual(s.state.reservations, []);
});
test('current read failure clears both datasets with safe common error', async () => {
  const s = screen(() => { throw new Error('private phone'); }); await s.run(); assert.deepEqual(s.state.schedules, []); assert.deepEqual(s.state.reservations, []); assert.deepEqual(s.state.errors, ['SCHEDULE_LOAD_FAILED']); assert.equal(s.state.busy.at(-1), false);
});
test('older success cannot overwrite newer schedules/reservations or release loading', async () => {
  let finish; const s = screen(() => new Promise(yes => { finish = yes; })); const pending = s.run(); s.deps.scheduleReadRequest.current++;
  finish({ schedules: [schedule], reservations: [reservation()] }); await pending;
  assert.equal(s.state.schedules, null); assert.equal(s.state.reservations, null); assert.deepEqual(s.state.busy, [true]);
});
test('older error cannot clear latest state or show stale alert', async () => {
  let fail; const s = screen(() => new Promise((_, no) => { fail = no; })); const pending = s.run(); s.deps.scheduleReadRequest.current++;
  fail(new Error('private')); await pending; assert.equal(s.state.schedules, null); assert.equal(s.state.reservations, null); assert.deepEqual(s.state.errors, []); assert.deepEqual(s.state.busy, [true]);
});
test('overlapping reads retain only newest complete dataset', async () => {
  const finish = []; const s = screen(() => new Promise(yes => finish.push(yes))); const first = s.run(); const second = s.run();
  finish[1]({ schedules: [{ ...schedule, id: 'new' }], reservations: [] }); await second;
  finish[0]({ schedules: [schedule], reservations: [reservation()] }); await first; assert.equal(s.state.schedules[0].id, 'new'); assert.deepEqual(s.state.reservations, []);
});
test('cleanup invalidates old requests on branch/profile/week/tab changes and screen has no inline queries', () => {
  assert.match(source, /scheduleReadRequest\.current \+= 1; \}, \[branchFilter, profile, weekStart, subTab\]/);
  assert.doesNotMatch(handlers.get('loadSchedules'), /supabase\.from|reason\?\.message|catch \(.*: any\)/);
});
test('schedule error message matches the app catalog', () => {
  const app = readFileSync(new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8'); assert.equal(app.match(/SCHEDULE_LOAD_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.SCHEDULE_LOAD_FAILED);
});
