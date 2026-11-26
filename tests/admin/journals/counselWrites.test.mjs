import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { AppError } from '../../../src/errors/appError.ts';
import { saveCounselLog, publishCounselLog, deleteCounselLog } from '../../../src/pages/admin/journals/api/counselWrites.ts';
import { notifyJournal } from '../../../src/pages/admin/journals/api/journalNotification.ts';
const id = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
const payload = { branch_id: 'branch', student_id: student, counselor_name: '담당자', counsel_date: '2026-11-25', category: '학습상담', content: '상담 내용' };
const saved = { ...payload, id, is_parent_visible: false };
function mock(reply) {
  const calls = []; const query = {};
  for (const method of ['update', 'insert', 'delete', 'eq', 'select', 'single', 'maybeSingle']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.then = (resolve, reject) => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)).then(resolve, reject);
  return { calls, now: () => 'now', client: { from: table => { calls.push(['from', table]); return query; } } };
}
test('counsel insert preserves category, date, counselor, content, visibility and timestamp', async () => {
  const d = mock({ data: saved }); await saveCounselLog(payload, null, false, d);
  assert.deepEqual(d.calls, [['from', 'academy_counsel_logs'], ['insert', [{ ...payload, is_parent_visible: false, updated_at: 'now' }]], ['select'], ['single']]);
});
test('counsel edit uses its original ID and never inserts a new record', async () => {
  const d = mock({ data: { ...saved, is_parent_visible: true } }); await saveCounselLog(payload, id, true, d);
  assert.equal(d.calls.some(c => c[0] === 'insert'), false); assert.deepEqual(d.calls.find(c => c[0] === 'eq'), ['eq', 'id', id]);
});
test('save acknowledgements must identify the same student, branch, ID and visibility', async () => {
  for (const data of [null, { ...saved, id: student }, { ...saved, student_id: id }, { ...saved, branch_id: 'other' }, { ...saved, is_parent_visible: true }]) {
    await assert.rejects(saveCounselLog(payload, id, false, mock({ data })), e => e.code === 'JOURNAL_SAVE_UNCONFIRMED');
  }
});
test('invalid save fields stop before database access', async () => {
  for (const patch of [{ student_id: 'bad' }, { branch_id: null }, { content: ' ' }]) {
    const d = mock({}); await assert.rejects(saveCounselLog({ ...payload, ...patch }, null, false, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
for (const [name, run, fallback] of [['save', d => saveCounselLog(payload, null, false, d), 'JOURNAL_SAVE_UNCONFIRMED'], ['publish', d => publishCounselLog(id, d), 'JOURNAL_SAVE_UNCONFIRMED'], ['delete', d => deleteCounselLog(id, d), 'JOURNAL_DELETE_UNCONFIRMED']]) {
  test(name + ' preserves permission and deployment errors without raw server messages', async () => {
    for (const [code, expected] of [['42501', 'PERMISSION_DENIED'], ['PGRST202', 'SERVER_UPDATE_REQUIRED']]) {
      const d = mock({ error: { code, message: 'private phone token' } }); await assert.rejects(run(d), e => e.code === expected && !e.message.includes('private'));
      assert.equal(d.calls.filter(c => c[0] === 'from').length, 1);
    }
  });
  test(name + ' response loss remains unconfirmed and is not retried', async () => {
    const d = mock(new Error('private body')); await assert.rejects(run(d), e => e.code === fallback); assert.equal(d.calls.filter(c => c[0] === 'from').length, 1);
  });
}
test('publish preserves the existing private-only conditional update', async () => {
  const d = mock({ data: { id } }); await publishCounselLog(id, d);
  assert.deepEqual(d.calls.filter(c => c[0] === 'eq'), [['eq', 'id', id], ['eq', 'is_parent_visible', false]]);
  await assert.rejects(publishCounselLog(id, mock({ data: null })), e => e.code === 'CONFLICT_ERROR');
  await assert.rejects(publishCounselLog(id, mock({ data: { id: student } })), e => e.code === 'JOURNAL_SAVE_UNCONFIRMED');
});
test('delete needs the matching returned row and preserves no-row conflict guidance', async () => {
  await deleteCounselLog(id, mock({ data: { id } }));
  await assert.rejects(deleteCounselLog(id, mock({ data: null })), e => e.code === 'CONFLICT_ERROR');
  await assert.rejects(deleteCounselLog(id, mock({ data: { id: student } })), e => e.code === 'JOURNAL_DELETE_UNCONFIRMED');
});
test('counsel notifications reuse the shared new/update contract once', async () => {
  for (const updated of [false, true]) {
    const calls = []; await notifyJournal('counsel', id, updated, { client: { functions: { invoke: async (...args) => { calls.push(args); return { data: { success: true, targetCount: 0, sentCount: 0, failedCount: 0 } }; } } } });
    assert.deepEqual(calls, [['send-journal-notification', { body: { journalType: 'counsel', journalId: id, ...(updated ? { notificationKind: 'updated' } : {}) } }]]);
  }
});
const source = readFileSync(new URL('../../../src/pages/admin/journals/views/AdminCounselTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminCounselTab.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }); return new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps)); }
function screen(options = {}) {
  const state = { logs: [], writes: 0, notices: 0, prompts: 0, errors: [], alerts: [], resets: 0, saving: false, publishing: null };
  const deps = { AppError, mutationInFlight: { current: false }, loadSequence: { current: 1 }, formSequence: { current: 1 }, supabase: {},
    selectedStudentId: student, selectedStudent: { branch_id: 'branch' }, counselorName: ' ', profile: { name: '담당자' }, counselDate: payload.counsel_date, selectedCategory: payload.category, counselContent: ' 내용 ', editingLogId: null, counselLogs: [], sendParentNotification: true,
    setSaving: v => { state.saving = v; }, setPublishingId: v => { state.publishing = v; }, setCounselLogs: fn => { state.logs = fn(state.logs); },
    setEditingLogId() {}, setCounselContent: () => { state.resets++; }, setSelectedCategory() {}, setSendParentNotification() {},
    alert: v => state.alerts.push(v), confirm: () => { state.prompts++; return options.confirm !== false; }, handleError: async e => state.errors.push(e),
    saveCounselLog: async (...args) => { state.writes++; state.saveArgs = args; return options.write ? options.write() : saved; },
    publishCounselLog: async () => { state.writes++; if (options.write) await options.write(); }, deleteCounselLog: async () => { state.writes++; if (options.write) await options.write(); },
    notifySavedCounsel: async () => { state.notices++; }, notifyJournal: async () => options.notify ? options.notify() : { targetCount: 1, sentCount: 0, failedCount: 1 },
  };
  return { state, deps, run: name => compile(name, deps) };
}
test('save uses a shared lock, preserves payload fields and resets only after acknowledgement', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run('handleSaveCounsel')({ preventDefault() {} }); await s.run('handleSaveCounsel')({ preventDefault() {} }); assert.equal(s.state.writes, 1);
  finish(saved); await pending; assert.equal(s.state.logs[0].id, id); assert.equal(s.state.notices, 1); assert.equal(s.state.resets, 1);
  assert.equal(s.state.saveArgs[0].counselor_name, '담당자'); assert.equal(s.state.saveArgs[0].category, payload.category); assert.equal(s.state.saving, false);
});
test('visible counsel edits without notification cannot become private', async () => {
  const s = screen(); s.deps.editingLogId = id; s.deps.counselLogs = [{ ...saved, is_parent_visible: true }]; s.deps.sendParentNotification = false;
  await s.run('handleSaveCounsel')({ preventDefault() {} }); assert.equal(s.state.saveArgs[2], true); assert.equal(s.state.notices, 0);
});
for (const change of ['view', 'form']) test('save after ' + change + ' switch cannot reset the new editor', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run('handleSaveCounsel')({ preventDefault() {} });
  if (change === 'view') s.deps.loadSequence.current++; else s.deps.formSequence.current++;
  finish(saved); await pending; assert.equal(s.state.resets, 0); if (change === 'view') assert.deepEqual(s.state.logs, []);
});
test('unknown save never notifies or clears editor and always releases the lock', async () => {
  const s = screen({ write: async () => { throw new AppError('JOURNAL_SAVE_UNCONFIRMED'); } }); await s.run('handleSaveCounsel')({ preventDefault() {} });
  assert.equal(s.state.notices, 0); assert.equal(s.state.resets, 0); assert.equal(s.deps.mutationInFlight.current, false); assert.equal(s.state.saving, false);
});
test('notification failures remain saved-journal warnings', async () => {
  const s = screen({ notify: async () => { throw new AppError('PERMISSION_DENIED'); } }); await s.run('notifySavedCounsel')(id, false);
  assert.equal(s.state.errors[0].code, 'JOURNAL_NOTIFICATION_FAILED'); assert.equal(s.state.alerts.length, 0);
});
test('a saved counsel remains in the list and resets normally even when notification fails', async () => {
  const s = screen({ notify: async () => { throw new AppError('JOURNAL_NOTIFICATION_FAILED'); } });
  s.deps.notifySavedCounsel = s.run('notifySavedCounsel');
  await s.run('handleSaveCounsel')({ preventDefault() {} });
  assert.equal(s.state.logs[0].id, id); assert.equal(s.state.resets, 1); assert.equal(s.state.errors[0].code, 'JOURNAL_NOTIFICATION_FAILED');
});
test('notification summary exposes push failure counters without promising device receipt', async () => {
  const s = screen(); await s.run('notifySavedCounsel')(id, false); assert.match(s.state.alerts[0], /실패 1건/); assert.match(s.state.alerts[0], /수신을 보장/);
});
test('notification with no linked parent reports no targets', async () => {
  const s = screen({ notify: async () => ({ targetCount: 0, sentCount: 0, failedCount: 0 }) }); await s.run('notifySavedCounsel')(id, false); assert.match(s.state.alerts[0], /알림 대상은 없습니다/);
});
for (const name of ['handlePublishCounselLog', 'handleDeleteClick']) {
  test(name + ' blocks duplicate prompts and releases locks', async () => {
    let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const arg = name === 'handleDeleteClick' ? id : saved;
    const pending = s.run(name)(arg); await s.run(name)(arg); assert.equal(s.state.prompts, 1); assert.equal(s.state.writes, 1); finish(); await pending; assert.equal(s.deps.mutationInFlight.current, false);
  });
  test(name + ' cannot alter another branch snapshot', async () => {
    let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); s.state.logs = [saved];
    const pending = s.run(name)(name === 'handleDeleteClick' ? id : saved); s.deps.loadSequence.current++; finish(); await pending; assert.deepEqual(s.state.logs, [saved]);
  });
}
test('unconfirmed publication never requests notifications', async () => {
  const s = screen({ write: async () => { throw new AppError('CONFLICT_ERROR'); } }); await s.run('handlePublishCounselLog')(saved); assert.equal(s.state.notices, 0);
});
test('unconfirmed delete cannot remove the displayed row', async () => {
  const s = screen({ write: async () => { throw new AppError('JOURNAL_DELETE_UNCONFIRMED'); } }); s.state.logs = [saved]; await s.run('handleDeleteClick')(id); assert.deepEqual(s.state.logs, [saved]);
});
test('student selection, edit and cancel transitions invalidate previous form responses', () => {
  assert.match(source, /onClick=\{\(\) => \{\s*formSequence\.current \+= 1;\s*setSelectedStudentId/);
  assert.match(source, /onClick=\{\(\) => \{\s*formSequence\.current \+= 1;\s*setEditingLogId\(null\)/);
  assert.match(handlers.get('handleEditClick'), /formSequence\.current \+= 1/);
});
