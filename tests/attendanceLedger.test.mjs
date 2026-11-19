import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { paginateAttendance } from '../src/utils/attendancePagination.ts';
import { readAttendanceIdBatches, readAttendancePages } from '../src/utils/attendanceQuery.ts';
import { AppError, normalizeError } from '../src/errors/appError.ts';

const source = readFileSync(new URL('../src/components/admin/AdminPage.tsx', import.meta.url), 'utf8');

test('attendance pages preserve order, do not mutate the export data, and clamp the last page', () => {
  const rows = Array.from({ length: 41 }, (_, i) => i + 1);
  assert.deepEqual(paginateAttendance(rows, 1, 20).rows, rows.slice(0, 20));
  assert.deepEqual(paginateAttendance(rows, 2, 20).rows, rows.slice(20, 40));
  assert.deepEqual(paginateAttendance(rows, 9, 20), { page: 3, totalPages: 3, first: 41, last: 41, rows: [41] });
  assert.deepEqual(paginateAttendance(rows, 2, 50).rows, rows);
  assert.deepEqual(paginateAttendance([], 2, 20), { page: 1, totalPages: 1, first: 0, last: 0, rows: [] });
  assert.match(source, /attendanceView\.rows\.map/);
  assert.match(source, /shownAttendance\.forEach/);
});

// Exercise the real read path without a live Supabase connection or writes.
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true);
const definitions = new Map();
function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    definitions.set(node.name.text, node.initializer.getText(ast));
  }
  ts.forEachChild(node, collect);
}
collect(ast);
const dependencies = ['MAX_SLOTS', 'excluded', 'firstJoined', 'kstDateKey', 'isBeforeChildDeletion', 'rangeOf', 'moveMonth', 'weeklyCount', 'scopedBranchId', 'loadAttendance'];
const loaderCode = ts.transpile(dependencies.map((name) => `const ${name} = ${definitions.get(name)};`).join('\n'), { target: ts.ScriptTarget.ES2022 });
const ids = ['keypad', 'app', 'web', 'manual', 'legacy', 'multi'];
const reservationUsage = (child, date, attendance_status = '등원', deleted_at = null) => ({
  id: `${child}-${date}`, user_package_id: child, quantity: 1, reservations: { class_date: date, attendance_status, deleted_at },
});

function mockLedger({ errorTable } = {}) {
  const tables = {
    children: ids.map((id) => ({ id, child_name: id, parent_id: 'parent' })),
    user_packages: [...ids.map((id) => ({ id, child_id: id, total_count: 30, remaining_count: 29 })), { id: 'multi-2', child_id: 'multi', total_count: 30, remaining_count: 30 }],
    attendance_logs: ['legacy', 'multi'].map((child_id) => ({ child_id, date: '2026-11-04', status: '등원' })),
    user_withdrawals: [],
    users: [{ id: 'parent', name: '보호자' }],
    package_usage_logs: [
      reservationUsage('keypad', '2026-11-01'), reservationUsage('app', '2026-11-02'), reservationUsage('web', '2026-11-03'),
      { id: 'manual-usage', user_package_id: 'manual', quantity: 1, consumed_at: '2026-10-31T16:00:00Z' },
      reservationUsage('app', '2026-11-11', '결석'), reservationUsage('app', '2026-11-12', '보강'),
      reservationUsage('app', '2026-11-13', '등원', '2026-11-14'), reservationUsage('web', '2026-10-31'),
    ],
  };
  const state = { rows: [], loading: false, failed: false, errors: [] };
  const filters = [];
  const supabase = { from(table) {
    let range = [0, 499];
    let direct = false;
    const query = { then(resolve, reject) {
      const rows = table === 'package_usage_logs' ? tables[table].filter((row) => direct === !row.reservations) : tables[table];
      return Promise.resolve(errorTable === table ? { error: { code: '42501' } } : { data: rows.slice(range[0], range[1] + 1), error: null }).then(resolve, reject);
    } };
    for (const method of ['select', 'is', 'order', 'or', 'gte', 'lte', 'lt', 'not', 'eq', 'in', 'neq', 'range']) {
      query[method] = (...args) => {
        if (method === 'range') range = args;
        if (method === 'is' && args[0] === 'reservation_id') direct = true;
        filters.push([table, method, ...args]); return query;
      };
    }
    return query;
  } };
  const scope = {
    supabase, readAttendancePages, readAttendanceIdBatches, profile: { role: 'admin', id: 'mock' }, branchFilter: 'branch-test', month: '2026-11',
    attendanceQueryKey: 'mock-key', attendanceLoadRequest: { current: 0 }, useCallback: (fn) => fn,
    setAttendanceLoading: (value) => { state.loading = value; }, setAttendanceLoadFailed: (value) => { state.failed = value; },
    setAttendance: (rows) => { state.rows = rows; }, setAttendanceLoadedKey: (key) => { state.key = key; },
    handleError: (error) => { state.errors.push(error.code); },
  };
  const load = new Function(...Object.keys(scope), `${loaderCode}\nreturn loadAttendance;`)(...Object.values(scope));
  return { load, state, tables, filters };
}

test('ledger reads shared usage data on refresh, respects the selected month, and retains legacy rules', async () => {
  const { load, state, tables, filters } = mockLedger();
  await load();
  const dates = (id) => state.rows.find((row) => row.id === id).dates;
  assert.deepEqual(ids.map(dates), [['2026-11-01'], ['2026-11-02'], ['2026-11-03'], ['2026-11-01'], ['2026-11-04'], []]);
  assert.deepEqual(state.rows.find((row) => row.id === 'manual').sources, [{ id: 'manual-usage', consumedAt: '2026-10-31T16:00:00Z' }]);
  assert.deepEqual(state.rows.find((row) => row.id === 'legacy').sources, [null]);
  assert.ok(filters.some((item) => item.join('/') === 'package_usage_logs/gte/reservations.class_date/2026-11-01'));
  assert.ok(filters.some((item) => item.join('/') === 'package_usage_logs/lt/consumed_at/2026-12-01T00:00:00+09:00'));
  assert.ok(filters.some((item) => item.join('/') === 'package_usage_logs/eq/status/consumed'));
  assert.ok(filters.some((item) => item.join('/') === 'attendance_logs/eq/branch_id/branch-test'));
  tables.package_usage_logs.push(reservationUsage('keypad', '2026-11-08'));
  await load();
  assert.deepEqual(dates('keypad'), ['2026-11-01', '2026-11-08']);
  assert.equal(state.loading, false);
  assert.equal(state.key, 'mock-key');
  assert.deepEqual(state.errors, []);
});

test('ledger reports a read permission failure instead of showing partial data as complete', async () => {
  const { load, state } = mockLedger({ errorTable: 'user_withdrawals' });
  await load();
  assert.equal(state.loading, false);
  assert.equal(state.failed, true);
  assert.deepEqual(state.rows, []);
  assert.deepEqual(state.errors, ['42501']);
});

test('DB paging continues below the requested page size and rejects partial results on a later error', async () => {
  const rows = Array.from({ length: 1251 }, (_, i) => i);
  assert.deepEqual(await readAttendancePages(async (from, to) => ({
    data: rows.slice(from, Math.min(from + 300, to + 1)), error: null,
  })), rows);
  await assert.rejects(readAttendancePages(async (from) =>
    from === 0 ? { data: [0], error: null } : { data: null, error: new Error('request failed') }), /request failed/);
  const ids = rows.slice(0, 82).map(String);
  const sizes = [];
  assert.deepEqual(await readAttendanceIdBatches(ids, async (batch) => { sizes.push(batch.length); return batch; }), ids);
  assert.deepEqual(sizes, [40, 40, 2]);
});

test('attendance calendar uses Korean midnight rather than UTC midnight', () => {
  const dateKey = new Function(ts.transpile(`return ${definitions.get('kstDateKey')};`, { target: ts.ScriptTarget.ES2022 }))();
  assert.equal(dateKey('2026-10-31T14:59:59Z'), '2026-10-31');
  assert.equal(dateKey('2026-10-31T15:00:00Z'), '2026-11-01');
});

function evaluateHandler(name, scope) {
  const body = ts.transpile(`return ${definitions.get(name)};`, { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(scope), body)(...Object.values(scope));
}

test('admin profile requires an active server record and an allowed role', async () => {
  const filters = [];
  const reply = { data: { id: 'staff', role: 'director' }, error: null };
  const query = { select: () => query, eq: (...args) => { filters.push(args); return query; }, maybeSingle: async () => reply };
  const loadProfile = evaluateHandler('loadAdminProfile', {
    supabase: { from: () => query }, AppError, canAccessAdminPortal: (role) => role === 'director',
  });
  assert.equal((await loadProfile('staff')).id, 'staff');
  assert.deepEqual(filters, [['id', 'staff'], ['status', 'active']]);
  reply.data = { id: 'parent', role: 'user' };
  await assert.rejects(loadProfile('parent'), { code: 'PERMISSION_DENIED' });
  reply.data = null;
  await assert.rejects(loadProfile('inactive'), { code: 'PERMISSION_DENIED' });
  assert.doesNotMatch(source, /const adminProf: Profile|initialProfile/);
});

test('manual registration sends one RPC during a duplicate click and reports a missing RPC safely', async () => {
  const requests = [];
  const reported = [];
  const flags = [];
  const inFlight = { current: false };
  let finish;
  const handleManual = evaluateHandler('handleManualAttendance', {
    attendanceModal: { childId: 'student', packageId: 'pass' },
    profile: { role: 'director' }, attendanceDate: '2026-11-17', month: '2026-11',
    manualAttendanceInFlight: inFlight, setActionLoading: (flag) => flags.push(flag),
    supabase: { rpc: (...args) => { requests.push(args); return new Promise((resolve) => { finish = resolve; }); } },
    AppError, normalizeError, handleError: async (error) => reported.push(error.code),
    attendanceDialog: { current: { close() { throw new Error('closed after failure'); } } },
    alert() { throw new Error('reported success after failure'); },
    loadAttendance() { throw new Error('unexpected refresh after failure'); },
  });
  const firstAttempt = handleManual();
  await handleManual();
  assert.deepEqual(requests, [['register_manual_ledger_attendance', { p_child_id: 'student', p_date: '2026-11-17', p_package_id: 'pass' }]]);
  finish({ data: null, error: { code: 'PGRST202' } });
  await firstAttempt;
  assert.deepEqual(reported, ['ATT_UPDATE_REQUIRED']);
  assert.deepEqual(flags, [true, false]);
  assert.equal(inFlight.current, false);
});

test('ledger date controls open a record before exposing the existing cancellation action', () => {
  assert.match(source, /onClick=\{\(\) => setAttendanceRecord\(\{ row, date, slot: i \+ 1, source: row\.sources\[i\] \?\? null \}\)\}/);
  assert.match(source, /onCancelAttendance=\{\(\) => void handleCancelAttendance\(attendanceRecord\.row, attendanceRecord\.date, attendanceRecord\.source\)\}/);
  assert.match(source, /scope="row"[\s\S]*출석 \{row\.dates\.length\}회[\s\S]*잔여 \{row\.remaining\}회/);
});

test('ledger cancellation sends one scoped RPC, stays open on error, and refreshes on success', async () => {
  const requests = [];
  const reports = [];
  const flags = [];
  const inFlight = { current: false };
  let finish;
  let confirmed = false;
  let closed = 0;
  let refreshed = 0;
  const cancel = evaluateHandler('handleCancelAttendance', {
    profile: { role: 'director' },
    ledgerCancelInFlight: inFlight, setLedgerCancelPending: (flag) => flags.push(flag),
    confirm: () => confirmed,
    supabase: { rpc: (...args) => { requests.push(args); return new Promise((resolve) => { finish = resolve; }); } },
    AppError, handleError: async (error) => reports.push(error.code),
    attendanceRecordDialog: { current: { close: () => { closed++; } } },
    loadAttendance: async () => { refreshed++; },
    alert: () => {},
  });
  const args = [{ childId: 'child-a', id: 'package-a' }, '2026-11-02', { id: 'usage-a', consumedAt: '2026-11-02T02:00:00Z' }];
  await cancel(...args);
  assert.equal(requests.length, 0);
  confirmed = true;
  const rejected = cancel(...args);
  await cancel(...args);
  assert.deepEqual(requests, [['cancel_attendance_ledger_entry', { p_child_id: 'child-a', p_date: '2026-11-02', p_package_id: 'package-a', p_usage_id: 'usage-a', p_expected_consumed_at: '2026-11-02T02:00:00Z' }]]);
  finish({ data: null, error: { code: '42501' } });
  await rejected;
  assert.deepEqual(reports, ['42501']);
  assert.equal(closed, 0);
  assert.equal(refreshed, 0);
  const succeeded = cancel(...args);
  finish({ data: { cancelled: true, restored: 1 }, error: null });
  await succeeded;
  assert.equal(closed, 1);
  assert.equal(refreshed, 1);
  assert.deepEqual(flags, [true, false, true, false]);
  assert.equal(inFlight.current, false);
});
