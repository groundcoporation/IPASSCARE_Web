import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { writeBatchTimelineAction } from '../../../src/pages/admin/attendance/api/batchTimelineAction.ts';
import { attendanceNotificationActions } from '../../../src/pages/admin/attendance/model/timelineActions.ts';
import { AppError } from '../../../src/errors/appError.ts';
const targets = [1, 2, 3].map(i => ({ studentId: `student${i}`, childId: `${i}1111111-1111-4111-8111-111111111111`, branchId: 'branch', record: {} }));
const input = patch => ({ targets, date: '2026-11-25', action: 'check_in', sendNotification: true, ...patch });
function mock(options = {}) {
  const calls = [];
  return { calls, client: {}, isCurrent: options.isCurrent,
    write: async value => { calls.push(['write', value.childId]); return options.write ? options.write(value) : { completedSteps: 4, issue: null }; },
    notify: async child => { calls.push(['notify', child]); if (options.notify) return options.notify(child); return { stored: true, pushed: false, skipped: false }; },
  };
}
for (const action of ['ride_in', 'check_in', 'check_out', 'ride_out', 'is_absent']) test(action + ' serializes each target and notifies only supported actions', async () => {
  const d = mock(); const result = await writeBatchTimelineAction(input({ action }), d);
  assert.deepEqual(result.map(x => x.storage), Array(3).fill('responses_received'));
  assert.equal(d.calls.filter(x => x[0] === 'notify').length, action === 'is_absent' ? 0 : 3);
  assert.deepEqual(d.calls.slice(0, 3), targets.map(t => ['write', t.childId]));
});
test('partial response stops remaining storage but notifies earlier fully responded targets only', async () => {
  const d = mock({ write: value => value.childId === targets[1].childId ? { completedSteps: 1, issue: new AppError('PERMISSION_DENIED') } : { completedSteps: 4, issue: null } });
  const result = await writeBatchTimelineAction(input(), d);
  assert.deepEqual(result.map(x => x.storage), ['responses_received', 'review_required', 'not_attempted']);
  assert.equal(result[1].completedSteps, 1);
  assert.deepEqual(d.calls, [['write', targets[0].childId], ['write', targets[1].childId], ['notify', targets[0].childId]]);
});
test('lost first response has no automatic retry or notification and leaves remaining targets untouched', async () => {
  const d = mock({ write: () => { throw new Error('private token'); } }); const r = await writeBatchTimelineAction(input(), d);
  assert.deepEqual(r.map(x => x.storage), ['review_required', 'not_attempted', 'not_attempted']);
  assert.equal(r[0].issue.code, 'ATT_TIMELINE_REVIEW_REQUIRED'); assert.equal(r[0].issue.message.includes('private'), false); assert.equal(d.calls.length, 1);
});
test('RPC missing contract stops without direct-table fallback', async () => {
  const d = mock({ write: () => ({ completedSteps: 0, issue: new AppError('SERVER_UPDATE_REQUIRED') }) });
  const r = await writeBatchTimelineAction(input(), d); assert.equal(r[0].issue.code, 'SERVER_UPDATE_REQUIRED'); assert.equal(d.calls.length, 1);
});
test('notification failure does not mark storage failed or retry the push', async () => {
  const d = mock({ notify: child => { if (child === targets[1].childId) throw new Error('private phone'); } });
  const r = await writeBatchTimelineAction(input(), d);
  assert.ok(r.every(x => x.storage === 'responses_received'));
  assert.deepEqual(r.map(x => x.notification), ['response_received', 'review_required', 'response_received']);
  assert.equal(r[1].notificationIssue.code, 'ATT_NOTIFICATION_FAILED'); assert.equal(d.calls.length, 6);
});
test('notification opt-out performs no external delivery', async () => {
  const d = mock(); const r = await writeBatchTimelineAction(input({ sendNotification: false }), d);
  assert.ok(r.every(x => x.notification === 'not_requested')); assert.equal(d.calls.length, 3);
});
test('scope change after first response stops later writes and notifications', async () => {
  let current = true; const d = mock({ isCurrent: () => current, write: () => { current = false; return { completedSteps: 4, issue: null }; } });
  const r = await writeBatchTimelineAction(input(), d);
  assert.deepEqual(r.map(x => x.storage), ['responses_received', 'not_attempted', 'not_attempted']); assert.equal(d.calls.length, 1);
});
test('scope change during notification stops remaining pushes without undoing stored rows', async () => {
  let current = true; const d = mock({ isCurrent: () => current, notify: () => { current = false; } });
  const r = await writeBatchTimelineAction(input(), d); assert.equal(d.calls.length, 4);
  assert.ok(r.every(x => x.storage === 'responses_received')); assert.deepEqual(r.map(x => x.notification), ['response_received', 'not_attempted', 'not_attempted']);
});
test('entire target set is checked before storage including later invalid target and duplicate child', async () => {
  for (const bad of [[], [...targets, { ...targets[0] }], [targets[0], { ...targets[1], childId: targets[0].childId }], [targets[0], { ...targets[1], branchId: '' }], [targets[0], { ...targets[1], branchId: 'all' }], [{ ...targets[0], childId: 'invalid' }]]) {
    const d = mock(); await assert.rejects(writeBatchTimelineAction(input({ targets: bad }), d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
test('invalid date and non-batch action never reach storage', async () => {
  for (const patch of [{ date: '2026-02-30' }, { date: '' }, { action: 'reset' }]) {
    const d = mock(); await assert.rejects(writeBatchTimelineAction(input(patch), d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
const source = readFileSync(new URL('../../../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }) + '\nreturn handler;')(...Object.values(deps)); }
function screen(options = {}) {
  const state = { errors: [], summaries: [], refresh: 0, closed: 0, busy: false, requests: [] };
  const deps = { AppError, profile: { role: 'director', branch_id: 'branch' }, scopedBranchId: p => p.branch_id, branchFilter: 'branch', supabase: {},
    todayAttendanceStudents: targets.map(t => ({ id: t.studentId, child_id: t.childId, branch_id: t.branchId })), todayAttendanceRecords: {}, selectedAttendanceDate: '2026-11-25', isStudentScheduledOnDate: () => true,
    timelineViewEpoch: { current: 1 }, attendanceNotificationActions, alert: v => state.summaries.push(v), handleError: async e => state.errors.push(e.code), loadDailyAttendanceStudents: async () => { state.refresh++; },
    writeBatchTimelineAction: async value => { state.requests.push(value); if (options.write) return options.write(value); return targets.map(t => ({ studentId: t.studentId, storage: 'responses_received', notification: 'not_requested' })); },
    attendanceConfirmation: { mode: 'batch', action: 'check_in', targetCount: 3, targetIds: targets.map(t => t.studentId), sendNotification: false }, attendanceActionBusy: false,
    timelineInFlight: { current: false }, manualAttendanceInFlight: { current: false }, ledgerCancelInFlight: { current: false },
    setAttendanceActionBusy: v => { state.busy = v; }, setAttendanceConfirmation: () => { state.closed++; }, executeTimelineAction: async () => {},
  };
  deps.executeBatchTimelineAction = compile('executeBatchTimelineAction', deps);
  return { state, deps, run: () => compile('confirmAttendanceAction', deps)() };
}
test('batch UI uses confirmed snapshot not current selection; refreshes without optimistic status patch', async () => {
  const s = screen(); await s.run(); assert.equal(s.state.requests.length, 1); assert.deepEqual(s.state.requests[0].targets.map(t => t.studentId), targets.map(t => t.studentId));
  assert.equal(s.state.refresh, 1); assert.equal(s.state.closed, 1); assert.match(s.state.summaries[0], /저장 응답 확인 3명/);
  assert.doesNotMatch(handlers.get('executeBatchTimelineAction'), /setTodayAttendanceRecords|branch_1|supabase\.from/);
});
test('missing or conflicting branch prevents every write before fallback', async () => {
  for (const branch of [null, 'other']) { const s = screen(); s.deps.profile.branch_id = null; if (branch === 'other') { s.deps.profile.branch_id = 'other'; }
    await s.run(); assert.equal(s.state.requests.length, 0); assert.deepEqual(s.state.errors, ['PERMISSION_DENIED']);
  }
});
test('batch duplicate confirm lock releases after response loss', async () => {
  let reject; const s = screen({ write: () => new Promise((_, no) => { reject = no; }) }); const pending = s.run(); await s.run(); assert.equal(s.state.requests.length, 1);
  reject(new Error('private')); await pending; assert.equal(s.deps.timelineInFlight.current, false); assert.equal(s.state.busy, false); assert.equal(s.state.refresh, 1);
});
test('batch view switch does not refresh or close new screen or show stale summary', async () => {
  let finish; const s = screen({ write: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); s.deps.timelineViewEpoch.current++;
  finish([]); await pending; assert.equal(s.state.refresh, 0); assert.equal(s.state.closed, 0); assert.equal(s.state.summaries.length, 0);
});
test('batch partial storage and notification errors are distinguished in UI', async () => {
  const s = screen({ write: () => [{ storage: 'responses_received', notification: 'review_required' }, { storage: 'review_required', notification: 'not_attempted', issue: new AppError('PERMISSION_DENIED') }, { storage: 'not_attempted', notification: 'not_attempted' }] });
  await s.run(); assert.deepEqual(s.state.errors, ['ATT_TIMELINE_REVIEW_REQUIRED', 'PERMISSION_DENIED', 'ATT_NOTIFICATION_FAILED']); assert.match(s.state.summaries[0], /결과 확인 필요 1명 · 미실행 1명/); assert.equal(s.state.refresh, 1);
});
test('batch selection is deduplicated before confirmation and action lock prevents reopening', () => {
  let confirmed; const deps = { selectedStudentIds: ['student1', 'student1', 'student2'], filteredAttendanceStudents: [], todayAttendanceStudents: [{ id: 'student1' }, { id: 'student2' }], isStudentScheduledOnDate: () => true,
    attendanceActionBusy: false, timelineInFlight: { current: false }, attendanceNotificationActions, setAttendanceConfirmation: v => { confirmed = v; }, alert: () => {} };
  deps.getBatchAttendanceTargetIds = compile('getBatchAttendanceTargetIds', deps); compile('handleBatchTimelineAction', deps)('check_in');
  assert.deepEqual(confirmed.targetIds, ['student1', 'student2']); assert.equal(confirmed.targetCount, 2);
  confirmed = null; deps.timelineInFlight.current = true; compile('handleBatchTimelineAction', deps)('check_in'); assert.equal(confirmed, null);
});
