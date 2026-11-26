import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { buildDailyAttendance } from '../../../src/pages/admin/attendance/model/dailyAttendance.ts';
import { loadDailyAttendance } from '../../../src/pages/admin/attendance/api/dailyAttendance.ts';
import { loadCalendarAttendance } from '../../../src/pages/admin/attendance/api/calendarAttendance.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';
const students = [{ id: 'student', child_id: 'child', parent_user_id: 'parent' }, { id: 'manual', child_id: null }];
test('daily projection preserves app schedules, manual students and deleted-family exclusion', () => {
  const input = [...students, { id: 'deleted', child_id: 'gone', child: { deleted_at: 'date' } }, { id: 'deleted-parent', parent_user_id: 'gone', parent_user: { status: 'deleted' } }];
  const map = new Map([['child', [{ id: 'class', target_class: '가상 수업' }]]]); const before = structuredClone(input);
  const result = buildDailyAttendance(input, [], [], map);
  assert.deepEqual(result.studentsList.map(s => s.id), ['student', 'manual']); assert.equal(result.studentsList[0].app_schedule_classes[0].id, 'class'); assert.equal(result.studentsList[1].app_schedule_classes, undefined); assert.deepEqual(input, before);
});
test('log records use linked child or manual student IDs and retain absence/shuttle flags', () => {
  const result = buildDailyAttendance(students, [{ id: 'log', child_id: 'child', status: '결석', check_in: '14:12' }, { id: 'manual-log', child_id: 'manual', status: '미탑승' }], [], new Map());
  assert.equal(result.recordsMap.student.log_id, 'log'); assert.equal(result.recordsMap.student.check_in, '14:12'); assert.equal(result.recordsMap.student.is_absent, true); assert.equal(result.recordsMap.manual.no_pickup, true);
});
test('legacy host-local timestamp formatting is preserved while invalid times are ignored', () => {
  const iso = '2026-11-25T05:12:00Z'; const d = new Date(iso); const expected = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const result = buildDailyAttendance(students, [{ id: 'log', child_id: 'child', check_in: iso, check_out: 'invalid' }], [], new Map());
  assert.equal(result.recordsMap.student.check_in, expected); assert.equal(result.recordsMap.student.check_out, undefined);
});
test('reservation cancellations are excluded and missing shuttle times keep the existing fallbacks', () => {
  const rows = ['cancelled', 'canceled', '취소', '취소요청', 'cancel_requested'].map(status => ({ child_id: 'ignored', status }));
  rows.push({ child_id: 'child', pickup_shuttle_status: 'boarded', dropoff_shuttle_status: 'dropped_off' });
  const result = buildDailyAttendance(students, [], rows, new Map()); assert.deepEqual(result.reservationChildIds, ['child']); assert.equal(result.recordsMap.student.ride_in, '14:00'); assert.equal(result.recordsMap.student.ride_out, '16:00');
});
test('missed pickup/dropoff override existing ride times without mutating input', () => {
  const logs = [{ id: 'log', child_id: 'child', shuttle_ride_time: '14:01', shuttle_drop_time: '16:01' }]; const res = [{ child_id: 'child', pickup_shuttle_status: 'missed', dropoff_shuttle_status: 'missed', attendance_status: '결석' }]; const before = structuredClone({ logs, res });
  const record = buildDailyAttendance(students, logs, res, new Map()).recordsMap.student; assert.equal(record.ride_in, undefined); assert.equal(record.ride_out, undefined); assert.equal(record.no_shuttle, true); assert.equal(record.is_absent, true); assert.deepEqual({ logs, res }, before);
});
function fixture({ failTable, failSchedules = false } = {}) {
  const calls = []; const tables = { academy_students: students, attendance_logs: [{ id: 'log', child_id: 'child', check_in: '14:00' }], reservations: [{ child_id: 'child', status: 'active' }, { child_id: 'cancelled', status: '취소' }] };
  return { calls, loadSchedules: async ids => { calls.push(['schedules', ids]); if (failSchedules) throw new Error('private schedule'); return new Map(); }, client: { from(table) {
    const q = {}; for (const method of ['select', 'is', 'order', 'eq', 'gte', 'lte']) q[method] = (...args) => { calls.push([table, method, ...args]); return q; };
    q.then = (resolve, reject) => Promise.resolve(failTable === table ? { error: { code: '42501', message: 'private phone token' } } : { data: tables[table] }).then(resolve, reject); return q;
  } } };
}
test('daily service keeps selected branch/date, archived filter and separate active schedule lookup', async () => {
  const d = fixture(); const result = await loadDailyAttendance('branch', '2026-11-25', d);
  assert.equal(result.recordsMap.student.check_in, '14:00'); assert.ok(d.calls.some(c => c[0] === 'academy_students' && c[1] === 'is' && c[2] === 'archived_at'));
  for (const table of ['academy_students', 'attendance_logs', 'reservations']) assert.ok(d.calls.some(c => c[0] === table && c[1] === 'eq' && c[2] === 'branch_id' && c[3] === 'branch'));
  assert.deepEqual(d.calls.find(c => c[0] === 'schedules'), ['schedules', ['child']]);
});
for (const table of ['academy_students', 'attendance_logs', 'reservations']) test('daily ' + table + ' failure rejects the entire snapshot without raw data', async () => {
  await assert.rejects(loadDailyAttendance('branch', '2026-11-25', fixture({ failTable: table })), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private'));
});
test('daily active schedule lookup failure is normalized and prevents a partial result', async () => {
  await assert.rejects(loadDailyAttendance('branch', '2026-11-25', fixture({ failSchedules: true })), e => e.code === 'ATTENDANCE_DAILY_LOAD_FAILED');
});
test('invalid date/month stop before queries', async () => {
  const d = fixture(); await assert.rejects(loadDailyAttendance(null, '2026-02-30', d), e => e.code === 'INPUT_INVALID'); await assert.rejects(loadCalendarAttendance(null, '2026-13', d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
});
test('calendar preserves month boundaries and removes cancelled reservations only', async () => {
  const d = fixture(); const result = await loadCalendarAttendance('branch', '2026-02', d); assert.equal(result.logs.length, 1); assert.equal(result.reservations.length, 1);
  assert.ok(d.calls.some(c => c[0] === 'attendance_logs' && c[1] === 'lte' && c[2] === 'date' && c[3] === '2026-02-28'));
  assert.ok(d.calls.some(c => c[0] === 'reservations' && c[1] === 'eq' && c[2] === 'branch_id' && c[3] === 'branch'));
});
for (const table of ['attendance_logs', 'reservations']) test('calendar ' + table + ' failure rejects both results', async () => {
  await assert.rejects(loadCalendarAttendance('branch', '2026-11', fixture({ failTable: table })), e => e.code === 'PERMISSION_DENIED');
});
const source = readFileSync(new URL('../../../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8'); const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function screen(name, options = {}) {
  const state = { updates: [], errors: [], reads: 0 }; const snapshot = { studentsWithHistory: [], studentsList: [], activeReservations: [], reservationChildIds: [], recordsMap: {}, logs: [], reservations: [] };
  const read = async () => { state.reads++; return options.read ? options.read() : snapshot; };
  const deps = { AppError, profile: options.profile || { role: 'admin' }, branchFilter: 'branch', attendanceCalendarMonth: '2026-11', selectedAttendanceDate: '2026-11-25', dailyLoadRequest: { current: 1 }, calendarLoadRequest: { current: 1 }, useCallback: fn => fn, supabase: {}, loadActiveAppSchedulesByChild() {}, scopedBranchId: p => p.role === 'admin' ? 'branch' : p.branch_id,
    loadDailyAttendance: read, loadCalendarAttendance: read, handleError: async e => state.errors.push(e) };
  for (const setter of ['setAttendanceStudentsWithHistory', 'setTodayAttendanceStudents', 'setTodayReservations', 'setTodayReservationChildIds', 'setTodayAttendanceRecords', 'setCalendarMonthLogs', 'setCalendarMonthReservations']) deps[setter] = value => state.updates.push([setter, value]);
  const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 });
  return { state, deps, run: new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps)) };
}
for (const [name, ref, size] of [['loadDailyAttendanceStudents', 'dailyLoadRequest', 5], ['loadAttendanceCalendarLogs', 'calendarLoadRequest', 2]]) {
  test(name + ' publishes the complete snapshot together', async () => { const s = screen(name); await s.run(); assert.equal(s.state.updates.length, size); });
  test(name + ' clears every dependent state on current failure', async () => { const s = screen(name, { read: async () => { throw new AppError('PERMISSION_DENIED'); } }); await s.run(); assert.equal(s.state.updates.length, size); assert.equal(s.state.errors[0].code, 'PERMISSION_DENIED'); });
  for (const fails of [false, true]) test(name + ' ignores stale ' + (fails ? 'failure' : 'success'), async () => {
    let finish; const s = screen(name, { read: () => new Promise((resolve, reject) => { finish = fails ? () => reject(new Error('private')) : () => resolve({}); }) });
    const pending = s.run(); s.deps[ref].current++; finish(); await pending; assert.equal(s.state.updates.length, 0); assert.equal(s.state.errors.length, 0);
  });
  test(name + ' blocks non-admin missing branch before querying', async () => { const s = screen(name, { profile: { role: 'director', branch_id: null } }); await s.run(); assert.equal(s.state.reads, 0); assert.equal(s.state.errors[0].code, 'PERMISSION_DENIED'); });
}
test('view cleanup invalidates daily and calendar reads independently', () => {
  assert.match(source, /useEffect\(\(\) => \(\) => \{ dailyLoadRequest.current \+= 1; timelineViewEpoch.current \+= 1; \}, \[branchFilter, profile, selectedAttendanceDate, subTab\]\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{ calendarLoadRequest.current \+= 1; \}, \[branchFilter, profile, attendanceCalendarMonth, subTab\]\)/);
});
const app = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('daily/calendar errors match app messages', { skip: !existsSync(app) }, () => { const text = readFileSync(app, 'utf8'); for (const code of ['ATTENDANCE_DAILY_LOAD_FAILED', 'ATTENDANCE_CALENDAR_LOAD_FAILED']) assert.equal(text.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]); });
