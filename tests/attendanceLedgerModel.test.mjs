import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { buildAttendanceLedger } from '../src/pages/admin/attendance/model/attendanceLedger.ts';
import { loadAttendanceLedger } from '../src/pages/admin/attendance/api/attendanceLedger.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const snapshot = patch => ({ children: [{ id: 'child', child_name: '가상 자녀', parent_id: 'parent' }], packages: [{ id: 'pass', child_id: 'child', package_name: '주 2회 수업', total_count: 30, remaining_count: 28 }], logs: [], withdrawals: [], parentRows: [{ id: 'parent', name: '가상 보호자', status: 'active' }], reservedUsage: [], directUsage: [], ...patch });
const month = '2026-11';
const usage = patch => ({ id: 'usage', user_package_id: 'pass', quantity: 1, consumed_at: '2026-11-01T01:00:00Z', ...patch });
test('model retains source IDs, Korean dates, quantity expansion and stable chronological order', () => {
  const s = snapshot({ directUsage: [usage({ consumed_at: '2026-11-02T16:00:00Z', quantity: 2 })], reservedUsage: [usage({ id: 'reservation', reservations: [{ class_date: '2026-11-01', attendance_status: '등원' }] })] }); const before = structuredClone(s);
  const [row] = buildAttendanceLedger(s, month); assert.deepEqual(row.dates, ['2026-11-01', '2026-11-03', '2026-11-03']);
  assert.deepEqual(row.sources.map(x => x.id), ['reservation', 'usage', 'usage']); assert.equal(row.weekly, 2); assert.equal(row.used, 3); assert.deepEqual(s, before);
});
test('absent/makeup/deleted reservations and out-of-month direct usage are excluded', () => {
  const s = snapshot({ reservedUsage: ['결석', '보 강'].map(status => usage({ reservations: { class_date: '2026-11-01', attendance_status: status } })).concat(usage({ reservations: { class_date: '2026-11-01', deleted_at: 'deleted' } })), directUsage: [usage({ consumed_at: '2026-10-31T14:59:59Z' }), usage({ consumed_at: '2026-11-30T15:00:00Z' }), usage({ consumed_at: 'invalid' })] });
  assert.deepEqual(buildAttendanceLedger(s, month)[0].dates, []);
});
test('legacy dates are used only for a single package without actual usage', () => {
  const s = snapshot({ logs: [{ child_id: 'child', date: '2026-11-02', status: '등원' }] });
  assert.deepEqual(buildAttendanceLedger(s, month)[0].sources, [null]);
  assert.deepEqual(buildAttendanceLedger({ ...s, directUsage: [usage()] }, month)[0].dates, ['2026-11-01']);
  assert.equal(buildAttendanceLedger({ ...s, packages: [...s.packages, { ...s.packages[0], id: 'other' }] }, month).every(row => row.dates.length === 0), true);
});
test('deleted children/parents and settled withdrawal accounts are excluded while pending refunds remain', () => {
  assert.deepEqual(buildAttendanceLedger(snapshot({ children: [{ id: 'child', deleted_at: '2026-11-01' }] }), month), []);
  assert.deepEqual(buildAttendanceLedger(snapshot({ parentRows: [{ id: 'parent', status: 'deleted' }] }), month), []);
  for (const refund_status of ['none', 'completed']) assert.deepEqual(buildAttendanceLedger(snapshot({ withdrawals: [{ user_id: 'parent', refund_status }] }), month), []);
  assert.equal(buildAttendanceLedger(snapshot({ withdrawals: [{ child_id: 'child', refund_status: 'pending' }] }), month)[0].withdrawalStatus, 'pending');
});
test('child-specific withdrawal takes precedence over account-level status', () => {
  const row = buildAttendanceLedger(snapshot({ withdrawals: [{ user_id: 'parent', refund_status: 'completed' }, { child_id: 'child', refund_status: 'pending' }] }), month)[0]; assert.equal(row.withdrawalStatus, 'pending');
});
test('children without passes keep a zero-count row and do not inherit legacy attendance', () => {
  const [row] = buildAttendanceLedger(snapshot({ packages: [], logs: [{ child_id: 'child', date: '2026-11-01', status: '등원' }] }), month);
  assert.equal(row.id, 'child-child'); assert.equal(row.packageName, '이용권 없음'); assert.equal(row.total, 0); assert.deepEqual(row.dates, []);
});
test('30-slot cap and retained remaining balance follow the original calculation', () => {
  const [row] = buildAttendanceLedger(snapshot({ packages: [{ id: 'pass', child_id: 'child', total_count: 50, remaining_count: 45 }], directUsage: [usage({ quantity: 35 })] }), month);
  assert.equal(row.total, 30); assert.equal(row.used, 30); assert.equal(row.dates.length, 30); assert.equal(row.sources.length, 30); assert.equal(row.remaining, 45);
});
test('empty ledger remains empty and fallback labels stay unchanged', () => {
  assert.deepEqual(buildAttendanceLedger(snapshot({ children: [] }), month), []);
  const [row] = buildAttendanceLedger(snapshot({ children: [{ id: 'child' }], parentRows: [] }), month); assert.equal(row.childName, '이름 없음'); assert.equal(row.parentName, '-');
});
function clientFixture(failTable) {
  const calls = [];
  const tables = { children: [{ id: 'child', parent_id: 'parent' }], user_packages: [{ id: 'pass', child_id: 'child', total_count: 1 }], attendance_logs: [], user_withdrawals: [], users: [{ id: 'parent', name: '가상 보호자' }], package_usage_logs: [] };
  return { calls, client: { from(table) {
    const query = {}; let range = [0, 499];
    for (const method of ['select', 'is', 'order', 'or', 'gte', 'lte', 'lt', 'not', 'eq', 'in', 'range']) query[method] = (...args) => { calls.push([table, method, ...args]); if (method === 'range') range = args; return query; };
    query.then = (resolve, reject) => Promise.resolve(table === failTable ? { error: { code: '42501', message: 'private' } } : { data: tables[table].slice(range[0], range[1] + 1) }).then(resolve, reject);
    return query;
  } } };
}
for (const table of ['children', 'user_packages', 'attendance_logs', 'user_withdrawals', 'users', 'package_usage_logs']) test(table + ' failure rejects the complete ledger safely', async () => {
  const d = clientFixture(table); await assert.rejects(loadAttendanceLedger('branch', month, d), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private'));
});
test('read service preserves branch scope, shuttle exclusion and Korean month boundaries', async () => {
  const d = clientFixture(); await loadAttendanceLedger('branch', month, d);
  assert.equal(['children', 'user_packages', 'attendance_logs', 'user_withdrawals'].every(table => d.calls.some(c => c[0] === table && c[1] === 'eq' && c[2] === 'branch_id' && c[3] === 'branch')), true);
  assert.ok(d.calls.some(c => c[1] === 'or' && c[2] === 'voucher_type.is.null,voucher_type.neq.shuttle'));
  assert.ok(d.calls.some(c => c[1] === 'lt' && c[2] === 'consumed_at' && c[3] === '2026-12-01T00:00:00+09:00'));
});
test('invalid month is rejected before queries and admin all-branch scope does not inject a branch filter', async () => {
  const invalid = clientFixture(); await assert.rejects(loadAttendanceLedger(null, '2026-13', invalid), e => e.code === 'INPUT_INVALID'); assert.equal(invalid.calls.length, 0);
  const d = clientFixture(); await loadAttendanceLedger(null, month, d); assert.equal(d.calls.some(c => c[1] === 'eq' && c[2] === 'branch_id'), false);
});
const source = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); let initializer;
function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'loadAttendance') initializer = n.initializer.getText(ast); ts.forEachChild(n, visit); } visit(ast);
function screen(options = {}) {
  const state = { rows: ['old'], loading: false, failed: false, errors: [], reads: 0 };
  const deps = { AppError, profile: options.profile || { role: 'admin' }, month, branchFilter: 'branch', attendanceQueryKey: 'key', attendanceLoadRequest: { current: 0 }, useCallback: fn => fn, supabase: {},
    scopedBranchId: p => p.role === 'admin' ? 'branch' : p.branch_id,
    loadAttendanceLedger: async () => { state.reads++; return options.read ? options.read() : []; },
    setAttendanceLoading: v => { state.loading = v; }, setAttendanceLoadFailed: v => { state.failed = v; }, setAttendance: v => { state.rows = v; }, setAttendanceLoadedKey() {}, handleError: async e => state.errors.push(e),
  };
  const code = ts.transpile('const handler = ' + initializer + ';', { target: ts.ScriptTarget.ES2022 }); return { state, deps, run: new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps)) };
}
test('non-admin missing branch cannot request the global ledger', async () => {
  const s = screen({ profile: { role: 'director', branch_id: null } }); await s.run(); assert.equal(s.state.reads, 0); assert.equal(s.state.errors[0].code, 'PERMISSION_DENIED');
});
for (const fail of [false, true]) test('stale ledger ' + (fail ? 'failure' : 'success') + ' cannot overwrite newer state', async () => {
  let finish; const s = screen({ read: () => new Promise((resolve, reject) => { finish = fail ? () => reject(new AppError('PERMISSION_DENIED')) : () => resolve(['late']); }) });
  const pending = s.run(); s.deps.attendanceLoadRequest.current++; finish(); await pending; assert.deepEqual(s.state.rows, ['old']); assert.equal(s.state.loading, true); assert.equal(s.state.errors.length, 0);
});
const app = new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('ledger load error matches the app catalog', { skip: !existsSync(app) }, () => {
  assert.equal(readFileSync(app, 'utf8').match(/ATTENDANCE_LEDGER_LOAD_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.ATTENDANCE_LEDGER_LOAD_FAILED);
});
