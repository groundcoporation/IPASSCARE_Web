import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { registerLedgerAttendance, cancelLedgerAttendance } from '../../../src/pages/admin/attendance/api/ledgerActions.ts';
import { AppError, normalizeError, errorMessages } from '../../../src/errors/appError.ts';
const childId = '11111111-1111-4111-8111-111111111111';
const packageId = '22222222-2222-4222-8222-222222222222';
const usageId = '33333333-3333-4333-8333-333333333333';
const date = '2026-11-25';
const source = { id: usageId, consumedAt: '2026-11-25T05:00:00.123Z' };
function mock(reply) { const calls = []; return { calls, client: { rpc: async (...args) => { calls.push(args); if (reply instanceof Error) throw reply; return reply; } } }; }
test('manual registration preserves existing RPC parameters and both acknowledgement statuses', async () => {
  for (const status of ['registered', 'already_registered']) {
    const d = mock({ data: { status } }); assert.deepEqual(await registerLedgerAttendance(childId, date, packageId, d), { alreadyRegistered: status === 'already_registered' });
    assert.deepEqual(d.calls, [['register_manual_ledger_attendance', { p_child_id: childId, p_date: date, p_package_id: packageId }]]);
  }
});
test('cancellation preserves exact usage ID and timestamp for server concurrency checks', async () => {
  const d = mock({ data: { cancelled: true, restored: 2 } }); assert.deepEqual(await cancelLedgerAttendance(childId, date, packageId, source, d), { restored: 2 });
  assert.deepEqual(d.calls, [['cancel_attendance_ledger_entry', { p_child_id: childId, p_date: date, p_package_id: packageId, p_usage_id: usageId, p_expected_consumed_at: source.consumedAt }]]);
});
test('legacy attendance cancellation retains null source and accepts zero restored quantity', async () => {
  const d = mock({ data: { cancelled: true, restored: 0 } }); await cancelLedgerAttendance(childId, date, packageId, null, d); assert.equal(d.calls[0][1].p_usage_id, null); assert.equal(d.calls[0][1].p_expected_consumed_at, null);
});
for (const [name, run] of [['register', d => registerLedgerAttendance(childId, date, packageId, d)], ['cancel', d => cancelLedgerAttendance(childId, date, packageId, source, d)]]) {
  for (const [code, expected] of [['42501', 'PERMISSION_DENIED'], ['PGRST202', 'ATT_UPDATE_REQUIRED'], ['PGRST301', 'AUTH_REQUIRED']]) test(name + ' keeps ' + expected + ' without retries or table fallback', async () => {
    const d = mock({ error: { code, message: 'private token phone' } }); await assert.rejects(run(d), e => e.code === expected && !e.message.includes('private')); assert.equal(d.calls.length, 1);
  });
  test(name + ' treats network loss or missing acknowledgements as unconfirmed', async () => {
    for (const reply of [new Error('private network'), { data: null }, { data: {} }]) { const d = mock(reply); await assert.rejects(run(d), e => e.code === 'ATT_LEDGER_WRITE_UNCONFIRMED'); assert.equal(d.calls.length, 1); }
  });
}
test('invalid IDs/dates and malformed source timestamps cannot send writes', async () => {
  const d = mock({});
  for (const [c, day, p] of [['bad', date, packageId], [childId, '2026-02-30', packageId], [childId, date, 'child-without-pass']]) await assert.rejects(registerLedgerAttendance(c, day, p, d), e => e.code === 'INPUT_INVALID');
  await assert.rejects(cancelLedgerAttendance(childId, date, packageId, { id: usageId, consumedAt: 'bad' }, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
});
test('malformed restored count stays unconfirmed; explicit cancelled false retains conflict guidance', async () => {
  for (const restored of [-1, 0.5, '1', undefined]) await assert.rejects(cancelLedgerAttendance(childId, date, packageId, null, mock({ data: { cancelled: true, restored } })), e => e.code === 'ATT_LEDGER_WRITE_UNCONFIRMED');
  await assert.rejects(cancelLedgerAttendance(childId, date, packageId, null, mock({ data: { cancelled: false } })), e => e.code === 'CONFLICT_ERROR');
});
const main = readFileSync(new URL('../../../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8'); const ast = ts.createSourceFile('AdminPage.tsx', main, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }); return new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps)); }
function screen(options = {}) {
  const state = { calls: 0, prompts: 0, refreshes: [], closed: 0, errors: [], alerts: [], loading: false, pending: false };
  const deps = { AppError, normalizeError, attendanceModal: { childId, packageId }, profile: { role: 'director' }, attendanceDate: date, month: '2026-11', supabase: {}, attendanceLoadRequest: { current: 1 }, manualAttendanceInFlight: { current: false }, ledgerCancelInFlight: { current: false },
    timelineInFlight: { current: false }, setActionLoading: v => { state.loading = v; }, setLedgerCancelPending: v => { state.pending = v; }, confirm: () => { state.prompts++; return options.confirm !== false; }, alert: message => state.alerts.push(message), handleError: async error => state.errors.push(error),
    attendanceDialog: { current: { close: () => { state.closed++; } } }, loadAttendance: async (...args) => { state.refreshes.push(args); if (options.refreshError) throw new AppError('ATT_LEDGER_REFRESH_FAILED'); },
  };
  const write = async () => { state.calls++; return options.write ? options.write() : { alreadyRegistered: false, restored: 1 }; };
  deps.registerLedgerAttendance = write; deps.cancelLedgerAttendance = write;
  return { state, deps, run: name => name === 'handleManualAttendance' ? compile(name, deps)() : compile(name, deps)({ childId, id: packageId }, date, source) };
}
for (const name of ['handleManualAttendance', 'handleCancelAttendance']) {
  test(name + ' blocks duplicate requests and releases its pending flags', async () => {
    let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(name); await s.run(name); assert.equal(s.state.calls, 1);
    finish({ alreadyRegistered: false, restored: 1 }); await pending; assert.deepEqual(s.state.refreshes, [[false]]); assert.equal(s.state.loading, false); assert.equal(s.state.pending, false);
  });
  test(name + ' keeps committed-change refresh failure distinct from another write failure', async () => {
    const s = screen({ refreshError: true }); await s.run(name); assert.equal(s.state.errors[0].code, 'ATT_LEDGER_REFRESH_FAILED'); assert.equal(s.state.calls, 1);
  });
  test(name + ' does not refresh an unknown write or automatically resend it', async () => {
    const s = screen({ write: async () => { throw new AppError('ATT_LEDGER_WRITE_UNCONFIRMED'); } }); await s.run(name); assert.equal(s.state.refreshes.length, 0); assert.equal(s.state.calls, 1); assert.equal(s.state.alerts.length, 0);
  });
  test(name + ' cannot reload the old view after a branch/month/tab change', async () => {
    let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(name); s.deps.attendanceLoadRequest.current++; finish({ alreadyRegistered: false, restored: 1 }); await pending; assert.equal(s.state.refreshes.length, 0); assert.equal(s.state.closed, 0);
  });
}
test('register and cancel cross-block each other before prompts', async () => {
  const s = screen(); s.deps.ledgerCancelInFlight.current = true; await s.run('handleManualAttendance'); assert.equal(s.state.calls, 0);
  s.deps.ledgerCancelInFlight.current = false; s.deps.manualAttendanceInFlight.current = true; await s.run('handleCancelAttendance'); assert.equal(s.state.calls, 0); assert.equal(s.state.prompts, 0);
});
test('cancel confirmation rejection causes no write', async () => { const s = screen({ confirm: false }); await s.run('handleCancelAttendance'); assert.equal(s.state.calls, 0); });
test('post-write ledger refresh throws one dedicated error rather than showing a generic read alert', async () => {
  const errors = []; const deps = { AppError, useCallback: fn => fn, profile: { role: 'admin' }, month: '2026-11', attendanceLoadRequest: { current: 1 }, attendanceQueryKey: 'key', branchFilter: 'branch', scopedBranchId: () => 'branch', supabase: {},
    loadAttendanceLedger: async () => { throw new AppError('PERMISSION_DENIED'); }, setAttendanceLoading() {}, setAttendanceLoadFailed() {}, setAttendance() {}, setAttendanceLoadedKey() {}, handleError: async e => errors.push(e) };
  await assert.rejects(compile('loadAttendance', deps)(false), e => e.code === 'ATT_LEDGER_REFRESH_FAILED'); assert.equal(errors.length, 0);
});
const app = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('ledger write and refresh messages match the app', { skip: !existsSync(app) }, () => { const text = readFileSync(app, 'utf8'); for (const code of ['ATT_LEDGER_WRITE_UNCONFIRMED', 'ATT_LEDGER_REFRESH_FAILED']) assert.equal(text.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]); });
