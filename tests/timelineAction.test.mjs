import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { writeTimelineAction } from '../src/pages/admin/attendance/api/timelineAction.ts';
import { notifyTimelineAttendance } from '../src/pages/admin/attendance/api/timelineNotification.ts';
import { attendanceNotificationActions } from '../src/pages/admin/attendance/model/timelineActions.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const child = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const request = action => ({ childId: child, branchId: 'branch', date: '2026-11-25', action, record: { check_in: '14:00', check_out: '16:00' } });
function mock(options = {}) {
  const calls = [];
  return { calls, now: () => '2026-11-25T05:00:00Z', client: {
    rpc: async (...args) => { calls.push(['rpc', ...args]); return options.rpc || { data: { status: 'consumed' }, error: null }; },
    from(table) {
      const context = { table, operation: 'read' }; const q = {};
      for (const method of ['delete', 'update', 'insert', 'select', 'eq', 'is', 'maybeSingle']) q[method] = (...args) => { calls.push([table, method, ...args]); if (['delete', 'update', 'insert'].includes(method)) context.operation = method; return q; };
      q.then = (resolve, reject) => Promise.resolve().then(() => {
        if (options.reply) { const result = options.reply(context); if (result instanceof Error) throw result; if (result !== undefined) return result; }
        return { data: context.operation === 'read' ? options.missing ? null : { id } : null, error: null };
      }).then(resolve, reject); return q;
    },
  } };
}
for (const action of ['ride_in','check_in','check_out','ride_out','no_pickup','no_dropoff','no_shuttle','is_absent','reset','cancel_ride_in','cancel_check_in','cancel_check_out','cancel_ride_out','cancel_absent']) test(action + ' uses the existing sequential storage path without notification side effects', async () => {
  const d = mock(); const result = await writeTimelineAction(request(action), d); assert.equal(result.issue, null); assert.ok(result.completedSteps > 0); assert.equal(d.calls.some(c => c[0] === 'functions'), false);
});
test('check-in/check-out retain the existing lesson RPC parameters before persistence', async () => {
  for (const action of ['check_in', 'check_out']) { const d = mock(); await writeTimelineAction(request(action), d); assert.deepEqual(d.calls[0], ['rpc', 'process_lesson_check_in', { p_reservation_id: null, p_child_id: child, p_branch_id: 'branch', p_class_date: '2026-11-25' }]); }
});
test('missing existing log inserts while an existing log updates only its ID', async () => {
  const absent = mock({ missing: true }); await writeTimelineAction(request('ride_in'), absent); assert.ok(absent.calls.some(c => c[0] === 'attendance_logs' && c[1] === 'insert'));
  const existing = mock(); await writeTimelineAction(request('ride_in'), existing); assert.ok(existing.calls.some(c => c[0] === 'attendance_logs' && c[1] === 'eq' && c[2] === 'id' && c[3] === id));
});
test('lesson RPC error stops before any direct-table fallback', async () => {
  const d = mock({ rpc: { error: { code: 'PGRST202', message: 'private' } } }); const result = await writeTimelineAction(request('check_in'), d); assert.equal(result.completedSteps, 0); assert.equal(result.issue.code, 'SERVER_UPDATE_REQUIRED'); assert.equal(d.calls.length, 1);
});
test('reservation or log error stops subsequent steps and preserves safe partial-result metadata', async () => {
  for (const table of ['reservations', 'attendance_logs']) {
    const d = mock({ reply: c => c.table === table ? { error: { code: '42501', message: 'private phone' } } : undefined }); const result = await writeTimelineAction(request('cancel_ride_in'), d);
    assert.equal(result.issue.code, 'PERMISSION_DENIED'); assert.equal(result.issue.message.includes('private'), false); assert.equal(result.completedSteps, table === 'reservations' ? 0 : 1);
  }
});
test('shuttle audit failure is no longer silently swallowed after reservation update', async () => {
  const d = mock({ reply: c => c.table === 'shuttle_logs' ? { error: { code: '42501' } } : undefined }); const result = await writeTimelineAction(request('no_pickup'), d);
  assert.equal(result.completedSteps, 1); assert.equal(result.issue.code, 'PERMISSION_DENIED'); assert.equal(d.calls.filter(c => c[1] === 'insert').length, 1);
});
test('lost write response is unconfirmed and is never retried', async () => {
  const d = mock({ reply: () => new Error('private network') }); const result = await writeTimelineAction(request('reset'), d); assert.equal(result.issue.code, 'ATT_TIMELINE_REVIEW_REQUIRED'); assert.equal(result.completedSteps, 0); assert.equal(d.calls.filter(c => c[1] === 'delete').length, 1);
});
test('invalid targets and actions cannot reach storage', async () => {
  for (const patch of [{ childId: 'bad' }, { branchId: '' }, { branchId: 'all' }, { date: '2026-02-30' }, { action: 'invalid' }]) { const d = mock(); const result = await writeTimelineAction({ ...request('ride_in'), ...patch }, d); assert.equal(result.issue.code, 'INPUT_INVALID'); assert.equal(d.calls.length, 0); }
});
function notify(reply) { const calls = []; return { calls, client: { functions: { invoke: async (...args) => { calls.push(args); if (reply instanceof Error) throw reply; return reply; } } } }; }
test('notification preserves request keys and validates stored/pushed versus skipped outcomes', async () => {
  for (const data of [{ success: true, skipped: true }, { success: true, stored: true, pushed: false }, { success: true, stored: true, pushed: true }]) {
    const d = notify({ data }); const result = await notifyTimelineAttendance(child, 'branch', '2026-11-25', 'ride_in', d);
    assert.deepEqual(d.calls, [['send-attendance-notification', { body: { child_id: child, branch_id: 'branch', service_date: '2026-11-25', action: 'ride_in' } }]]); assert.equal(result.pushed, data.pushed === true);
  }
});
test('unknown notification replies never retry or expose raw server data', async () => {
  for (const reply of [new Error('private token'), { data: null }, { data: { success: true } }, { data: { success: false, error: 'private' } }]) {
    const d = notify(reply); await assert.rejects(notifyTimelineAttendance(child, 'branch', '2026-11-25', 'check_in', d), e => e.code === 'ATT_NOTIFICATION_FAILED' && !e.message.includes('private')); assert.equal(d.calls.length, 1);
  }
});
const source = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8'); const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }); return new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps)); }
function screen(options = {}) {
  const state = { writes: 0, notices: 0, reads: 0, errors: [], closed: 0, busy: false };
  const deps = { AppError, todayAttendanceStudents: [{ id: 'student', child_id: child, branch_id: 'branch' }], profile: { role: 'director', branch_id: 'branch' }, branchFilter: 'branch', selectedAttendanceDate: '2026-11-25', todayAttendanceRecords: {}, timelineViewEpoch: { current: 1 }, supabase: {}, scopedBranchId: p => p.branch_id,
    attendanceNotificationActions, writeTimelineAction: async () => { state.writes++; return options.write ? options.write() : { completedSteps: 2, issue: null }; },
    sendAttendanceNotification: async () => { state.notices++; if (options.notifyError) throw new Error('private'); }, handleError: async e => state.errors.push(e), loadDailyAttendanceStudents: async () => { state.reads++; },
    attendanceConfirmation: { mode: 'single', studentId: 'student', action: 'check_in', sendNotification: true }, attendanceActionBusy: false,
    timelineInFlight: { current: false }, manualAttendanceInFlight: { current: false }, ledgerCancelInFlight: { current: false },
    setAttendanceActionBusy: v => { state.busy = v; }, setAttendanceConfirmation: () => { state.closed++; }, executeBatchTimelineAction: async () => {},
  };
  deps.executeTimelineAction = compile('executeTimelineAction', deps);
  return { state, deps, run: () => compile('confirmAttendanceAction', deps)() };
}
test('single action notifies only after successful storage and refreshes the current view', async () => { const s = screen(); await s.run(); assert.equal(s.state.writes, 1); assert.equal(s.state.notices, 1); assert.equal(s.state.reads, 1); });
test('partial storage failure cannot notify or masquerade as a full rollback', async () => { const s = screen({ write: async () => ({ completedSteps: 1, issue: new AppError('PERMISSION_DENIED') }) }); await s.run(); assert.equal(s.state.notices, 0); assert.deepEqual(s.state.errors.map(e => e.code), ['ATT_TIMELINE_REVIEW_REQUIRED', 'PERMISSION_DENIED']); });
test('notification failure remains separate from stored attendance', async () => { const s = screen({ notifyError: true }); await s.run(); assert.equal(s.state.writes, 1); assert.equal(s.state.errors[0].code, 'ATT_NOTIFICATION_FAILED'); assert.equal(s.state.reads, 1); });
test('synchronous confirmation lock prevents repeated writes before React rerenders', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(); await s.run(); assert.equal(s.state.writes, 1); finish({ completedSteps: 2, issue: null }); await pending; assert.equal(s.deps.timelineInFlight.current, false); assert.equal(s.state.busy, false);
});
test('scope change prevents stale refresh and closing a new confirmation', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(); s.deps.timelineViewEpoch.current++; finish({ completedSteps: 2, issue: null }); await pending; assert.equal(s.state.reads, 0); assert.equal(s.state.closed, 0);
});
test('ledger mutations block timeline confirmation', async () => { const s = screen(); s.deps.manualAttendanceInFlight.current = true; await s.run(); assert.equal(s.state.writes, 0); });
const app = new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('timeline partial-result warning matches the app', { skip: !existsSync(app) }, () => { assert.equal(readFileSync(app, 'utf8').match(/ATT_TIMELINE_REVIEW_REQUIRED:\s*"([^"]+)"/)?.[1], errorMessages.ATT_TIMELINE_REVIEW_REQUIRED); });
