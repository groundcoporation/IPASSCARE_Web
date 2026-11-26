import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadDashboardSnapshot, loadLegacyDashboardTab } from '../src/pages/admin/dashboard/api/dashboardReads.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const tables = ['academy_students', 'class_schedules', 'reservations', 'attendance_logs', 'academy_bills', 'academy_sms_balances', 'headquarter_notices'];
function mock(patch = {}) {
  const calls = []; const rows = Object.fromEntries(tables.map(t => [t, []])); Object.assign(rows, { web_inquiries: [], web_manual_videos: [], web_settings: { data: { lite_monthly_price: 39900 } } }, patch);
  return { calls, client: { from(table) { const q = {}; calls.push([table, 'from']);
    for (const method of ['select', 'eq', 'is', 'order', 'gte', 'lte', 'single']) q[method] = (...args) => { calls.push([table, method, ...args]); return q; };
    q.then = (yes, no) => Promise.resolve().then(() => { const reply = rows[table]; if (reply instanceof Error) throw reply; return Array.isArray(reply) ? { data: reply, error: null } : reply; }).then(yes, no); return q;
  } } };
}
test('main snapshot keeps six branch filters, HQ global query and leap-month date bounds', async () => {
  const d = mock(); const result = await loadDashboardSnapshot('branch', '2028-02', d); assert.deepEqual(result.hqNotices, []); assert.equal(result.pointBalance, 0);
  for (const table of tables.slice(0, 6)) assert.ok(d.calls.some(c => c[0] === table && c[1] === 'eq' && c[2] === 'branch_id' && c[3] === 'branch'));
  assert.equal(d.calls.some(c => c[0] === 'headquarter_notices' && c[1] === 'eq'), false);
  assert.ok(d.calls.some(c => c[0] === 'reservations' && c[1] === 'lte' && c[3] === '2028-02-29')); assert.ok(d.calls.some(c => c[0] === 'attendance_logs' && c[1] === 'gte' && c[3] === '2028-02-01'));
});
test('explicit admin null scope does not add branch filters', async () => {
  const d = mock(); await loadDashboardSnapshot(null, '2026-11', d); assert.equal(d.calls.some(c => c[1] === 'eq' && c[2] === 'branch_id'), false);
});
for (const table of tables) test(table + ' error rejects whole snapshot without synthetic HQ or partial KPI', async () => {
  const d = mock({ [table]: { data: [], error: { code: '42501', message: 'private' } } }); await assert.rejects(loadDashboardSnapshot('branch', '2026-11', d), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private'));
});
test('malformed/lost read never becomes default/empty success and is not retried', async () => {
  for (const reply of [{ data: null }, new Error('private')]) { const d = mock({ academy_bills: reply }); await assert.rejects(loadDashboardSnapshot('branch', '2026-11', d), e => e.code === 'DASHBOARD_LOAD_FAILED'); assert.equal(d.calls.filter(c => c[0] === 'academy_bills' && c[1] === 'from').length, 1); }
});
test('student joined object/array deletion filtering and point sum retain complete result', async () => {
  const rows = [{ id: 'keep', child_id: null, parent_user_id: null }, { id: 'deleted-child', child_id: 'c', child: [{ deleted_at: 'date' }] }, { id: 'deleted-parent', parent_user_id: 'p', parent: [{ status: 'deleted' }] }, { id: 'active', child_id: 'c', child: { deleted_at: null }, parent_user_id: 'p', parent: { status: 'active' } }];
  const r = await loadDashboardSnapshot('branch', '2026-11', mock({ academy_students: rows, academy_sms_balances: [{ point_balance: 10 }, { point_balance: 20 }], headquarter_notices: [] })); assert.deepEqual(r.students.map(x => x.id), ['keep', 'active']); assert.equal(r.pointBalance, 30); assert.deepEqual(r.hqNotices, []);
});
test('invalid month/branch cannot start queries', async () => {
  for (const args of [['', '2026-11'], ['all', '2026-11'], ['branch', '2026-13'], ['branch', '2026-1']]) { const d = mock(); await assert.rejects(loadDashboardSnapshot(...args, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0); }
});
test('legacy modal retains list/settings queries and no-query placeholder tabs', async () => {
  const d = mock(); assert.deepEqual((await loadLegacyDashboardTab('inquiries', d)).rows, []); assert.deepEqual((await loadLegacyDashboardTab('videos', d)).rows, []);
  const settings = await loadLegacyDashboardTab('settings', d); assert.equal(settings.settings.litePrice, '39900'); assert.equal(settings.settings.proPrice, '118000');
  for (const tab of ['payments', 'attendance']) { const empty = mock(); await loadLegacyDashboardTab(tab, empty); assert.equal(empty.calls.length, 0); }
});
test('legacy missing/settings errors are not editable default successes', async () => {
  for (const reply of [{ data: null }, { error: { code: '42501', message: 'private' } }]) await assert.rejects(loadLegacyDashboardTab('settings', mock({ web_settings: reply })));
  await assert.rejects(loadLegacyDashboardTab('invalid', mock()), e => e.code === 'INPUT_INVALID');
});
function definitions(modal) {
  const path = modal ? '../src/pages/admin/dashboard/components/AdminDashboardModal.tsx' : '../src/pages/admin/dashboard/views/AdminDashboardTab.tsx';
  const text = readFileSync(new URL(path, import.meta.url), 'utf8'); const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true); const vars = new Map(); let effect;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) vars.set(n.name.getText(ast), n.initializer.getText(ast)); if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') effect = n.arguments[0].getText(ast); ts.forEachChild(n, visit); } visit(ast); return { text, vars, effect };
}
function screen(modal, options = {}) {
  const def = definitions(modal); const name = modal ? 'fetchData' : 'loadDashboardData'; const profile = { id: 'u', role: modal ? 'admin' : 'director', branch_id: 'branch' };
  const state = { data: {}, errors: [], loading: [], reads: [], ready: false };
  const deps = { AppError, useCallback: fn => fn, profile, activeBranchId: 'selected', currentMonthStr: '2026-11', isOpen: true, activeTab: options.tab ?? 'inquiries', supabase: {},
    dashboardReadRequest: { current: 0 }, dashboardActiveView: { current: { profile, activeBranchId: 'selected' } }, modalReadRequest: { current: 0 }, modalActiveView: { current: { profile, isOpen: true, activeTab: options.tab ?? 'inquiries' } },
    setLoading: v => state.loading.push(v), setMsg() {}, setSettingsReadReady: v => { state.ready = v; }, handleError: async (e, fallback) => state.errors.push(e instanceof AppError ? e.code : fallback),
    loadDashboardSnapshot: async (...args) => { state.reads.push(args); return options.read ? options.read() : { students: [], schedules: [], reservations: [], attendanceLogs: [], bills: [], pointBalance: 0, hqNotices: [] }; },
    loadLegacyDashboardTab: async (...args) => { state.reads.push(args); return options.read ? options.read() : { rows: [{ id: 'synthetic' }], settings: null }; },
  };
  for (const key of ['Students', 'Schedules', 'Reservations', 'AttendanceLogs', 'Bills', 'PointBalance', 'HqNotices', 'Inquiries', 'Videos', 'LitePrice', 'ProPrice', 'KakaoUrl', 'ContactPhone', 'ContactEmail']) deps['set' + key] = value => { state.data[key] = value; };
  const compile = () => new Function(...Object.keys(deps), ts.transpile(`const ${name} = ${def.vars.get(name)}; const effect = ${def.effect}; return { run: ${name}, mount: effect };`, { target: ts.ScriptTarget.ES2022 }))(...Object.values(deps));
  return { deps, state, def, compile, run: () => compile().run() };
}
for (const modal of [false, true]) {
  const label = modal ? 'legacy modal' : 'dashboard';
  test(label + ' current success applies full response and releases loading', async () => { const s = screen(modal); await s.run(); assert.equal(s.state.reads.length, 1); assert.equal(s.state.loading.at(-1), false); assert.deepEqual(s.state.errors, []); });
  test(label + ' old success/error cannot change latest screen or release loading', async () => {
    for (const failure of [false, true]) { let finish, fail; const s = screen(modal, { read: () => new Promise((yes, no) => { finish = yes; fail = no; }) }); const pending = s.run(); (modal ? s.deps.modalReadRequest : s.deps.dashboardReadRequest).current++;
      if (failure) fail(new Error('private')); else finish({}); await pending; assert.deepEqual(s.state.data, {}); assert.deepEqual(s.state.errors, []); assert.deepEqual(s.state.loading, [true]);
    }
  });
  test(label + ' profile change/close invalidates current response and delayed reload start', async () => {
    const s = screen(modal); (modal ? s.deps.modalActiveView : s.deps.dashboardActiveView).current.profile = { id: 'other' }; await s.run(); assert.equal(s.state.reads.length, 0);
    let finish; const pendingScreen = screen(modal, { read: () => new Promise(yes => { finish = yes; }) }); const clean = pendingScreen.compile().mount(); clean(); finish({}); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(pendingScreen.state.data, {});
  });
  test(label + ' current failure clears visible lists and uses safe common error', async () => {
    const s = screen(modal, { read: () => { throw new Error('private'); } }); await s.run(); assert.deepEqual(s.state.errors, ['DASHBOARD_LOAD_FAILED']); if (modal) assert.deepEqual(s.state.data.Inquiries, []); else { assert.deepEqual(s.state.data.Students, []); assert.equal(s.state.data.PointBalance, 0); assert.deepEqual(s.state.data.HqNotices, []); }
  });
}
test('main scope uses own branch for staff and denies branchless staff/unsupported roles', async () => {
  const s = screen(false); await s.run(); assert.equal(s.state.reads[0][0], 'branch');
  const denied = screen(false); denied.deps.profile.branch_id = null; await denied.run(); assert.equal(denied.state.reads.length, 0); assert.deepEqual(denied.state.errors, ['PERMISSION_DENIED']);
  const role = screen(false); role.deps.profile.role = 'driver'; await role.run(); assert.equal(role.state.reads.length, 0);
});
test('legacy is closed/non-admin by default and settings save stays disabled until successful read', async () => {
  const s = screen(true); s.deps.isOpen = false; await s.run(); assert.equal(s.state.reads.length, 0);
  const denied = screen(true); denied.deps.profile.role = 'director'; await denied.run(); assert.equal(denied.state.reads.length, 0);
  const settings = screen(true, { tab: 'settings', read: () => ({ rows: [], settings: { litePrice: '1', proPrice: '2', kakaoUrl: 'https://example.invalid', contactPhone: 'synthetic', contactEmail: 'synthetic' } }) }); await settings.run(); assert.equal(settings.state.ready, true);
  assert.match(settings.def.text, /disabled=\{savingSettings \|\| loading \|\| !settingsReadReady\}/);
});
test('loaders are callback-based with no raw logs, inline queries or synthetic fallback', () => {
  for (const modal of [false, true]) { const def = definitions(modal); const fn = def.vars.get(modal ? 'fetchData' : 'loadDashboardData'); assert.match(fn, /^useCallback\(/); assert.doesNotMatch(fn, /console\.|supabase\.from|hq-launch/); }
});
test('dashboard error message matches app', () => {
  const app = readFileSync(new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8'); assert.equal(app.match(/DASHBOARD_LOAD_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.DASHBOARD_LOAD_FAILED);
});
