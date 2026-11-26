import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';
import { saveStudyLog, publishStudyLog, deleteStudyLog } from '../../../src/pages/admin/journals/api/studyWrites.ts';
import { notifyJournal } from '../../../src/pages/admin/journals/api/journalNotification.ts';
const id = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
const payload = { branch_id: 'branch', student_id: student, class_schedule_id: null, class_name: '미배정', teacher_name: '가상 담당자', lesson_date: '2026-11-25', title: '제목', content: '내용', homework: null, special_note: null };
const saved = { ...payload, id, is_parent_visible: false };
function mock(reply) {
  const calls = []; const query = {};
  for (const method of ['update', 'insert', 'delete', 'eq', 'select', 'single', 'maybeSingle']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.then = (resolve, reject) => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)).then(resolve, reject);
  return { calls, now: () => 'now', client: { from: table => { calls.push(['from', table]); return query; } } };
}
test('new study insert preserves payload, visibility and update timestamp', async () => {
  const d = mock({ data: saved }); const result = await saveStudyLog(payload, null, false, d);
  assert.equal(result.id, id); assert.deepEqual(d.calls, [['from', 'academy_study_logs'], ['insert', [{ ...payload, is_parent_visible: false, updated_at: 'now' }]], ['select'], ['single']]);
});
test('study edit preserves the requested ID and does not insert', async () => {
  const d = mock({ data: { ...saved, is_parent_visible: true } }); await saveStudyLog(payload, id, true, d);
  assert.equal(d.calls.some(c => c[0] === 'insert'), false); assert.deepEqual(d.calls.find(c => c[0] === 'eq'), ['eq', 'id', id]);
});
test('study save rejects mismatched row identity/visibility and missing acknowledgements', async () => {
  for (const data of [null, { ...saved, id: student }, { ...saved, student_id: id }, { ...saved, branch_id: 'other' }, { ...saved, is_parent_visible: true }]) {
    const d = mock({ data }); await assert.rejects(saveStudyLog(payload, id, false, d), e => e.code === 'JOURNAL_SAVE_UNCONFIRMED');
  }
});
test('study save validates required values before requests', async () => {
  const d = mock({}); await assert.rejects(saveStudyLog({ ...payload, content: ' ' }, null, false, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0);
});
for (const [name, run, fallback] of [['save', d => saveStudyLog(payload, null, false, d), 'JOURNAL_SAVE_UNCONFIRMED'], ['publish', d => publishStudyLog(id, d), 'JOURNAL_SAVE_UNCONFIRMED'], ['delete', d => deleteStudyLog(id, d), 'JOURNAL_DELETE_UNCONFIRMED']]) {
  test(name + ' checks response errors and preserves permission/server-update guidance', async () => {
    for (const [code, expected] of [['42501', 'PERMISSION_DENIED'], ['PGRST202', 'SERVER_UPDATE_REQUIRED']]) {
      const d = mock({ error: { code, message: 'private token' } }); await assert.rejects(run(d), e => e.code === expected && !e.message.includes('private')); assert.equal(d.calls.filter(c => c[0] === 'from').length, 1);
    }
  });
  test(name + ' lost response is unconfirmed without automatic retries', async () => {
    const d = mock(new Error('private')); await assert.rejects(run(d), e => e.code === fallback); assert.equal(d.calls.filter(c => c[0] === 'from').length, 1);
  });
}
test('publish and delete must return the requested row ID', async () => {
  for (const run of [publishStudyLog, deleteStudyLog]) {
    const d = mock({ data: { id } }); await run(id, d); assert.equal(d.calls.some(c => c[0] === 'maybeSingle'), true);
    await assert.rejects(run(id, mock({ data: { id: student } })));
    await assert.rejects(run(id, mock({ data: null })));
  }
});
function notification(reply) {
  const calls = []; return { calls, client: { functions: { invoke: async (...args) => { calls.push(args); if (reply instanceof Error) throw reply; return reply; } } } };
}
test('journal notifications preserve new/update payloads and only expose validated counters', async () => {
  for (const updated of [false, true]) {
    const d = notification({ data: { success: true, targetCount: 1, sentCount: 0, failedCount: 1, token: 'private' } });
    assert.deepEqual(await notifyJournal('study', id, updated, d), { targetCount: 1, sentCount: 0, failedCount: 1 });
    assert.deepEqual(d.calls, [['send-journal-notification', { body: { journalType: 'study', journalId: id, ...(updated ? { notificationKind: 'updated' } : {}) } }]]);
  }
});
test('notification unknown responses never retry or leak raw data', async () => {
  for (const reply of [new Error('private'), { data: null }, { data: { success: true, targetCount: 1 } }, { data: { success: true, targetCount: -1, sentCount: 0, failedCount: 0 } }]) {
    const d = notification(reply); await assert.rejects(notifyJournal('study', id, false, d), e => e.code === 'JOURNAL_NOTIFICATION_FAILED'); assert.equal(d.calls.length, 1);
  }
});
const source = readFileSync(new URL('../../../src/pages/admin/journals/views/AdminStudyTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudyTab.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }); return new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps)); }
function screen(options = {}) {
  const state = { logs: [], resets: 0, writes: 0, notices: 0, prompts: 0, alerts: [], errors: [], saving: false, publishing: null };
  const deps = { AppError, mutationInFlight: { current: false }, loadSequence: { current: 1 }, formSequence: { current: 1 }, supabase: {},
    studentId: student, selectedStudent: { branch_id: 'branch' }, title: ' title ', content: ' content ', classId: '', className: '', teacher: '', profile: { name: '담당자' }, date: '2026-11-25', homework: '', note: '', editingId: null, logs: [], notifyParent: true,
    setSaving: v => { state.saving = v; }, setPublishingId: v => { state.publishing = v; }, setLogs: fn => { state.logs = fn(state.logs); }, resetForm: () => { state.resets++; },
    alert: v => state.alerts.push(v), confirm: () => { state.prompts++; return options.confirm !== false; }, handleError: async e => state.errors.push(e),
    saveStudyLog: async (...args) => { state.writes++; state.saveArgs = args; return options.write ? options.write() : saved; },
    publishStudyLog: async () => { state.writes++; if (options.write) await options.write(); }, deleteStudyLog: async () => { state.writes++; if (options.write) await options.write(); },
    notifySavedStudy: async () => { state.notices++; if (options.notice) await options.notice(); },
    notifyJournal: async () => { if (options.notice) return options.notice(); return { targetCount: 1, sentCount: 0, failedCount: 1 }; },
  };
  return { state, deps, run: name => compile(name, deps) };
}
test('study save uses a shared lock and clears only the current form after acknowledgement', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run('saveLog')({ preventDefault() {} }); await s.run('saveLog')({ preventDefault() {} }); assert.equal(s.state.writes, 1);
  finish(saved); await pending; assert.equal(s.state.logs[0].id, id); assert.equal(s.state.resets, 1); assert.equal(s.state.notices, 1); assert.equal(s.state.saving, false);
});
test('a save completed after student/form change cannot reset the new form', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run('saveLog')({ preventDefault() {} });
  s.deps.formSequence.current++; finish(saved); await pending; assert.equal(s.state.resets, 0);
});
test('a save completed after branch change cannot publish into the new list', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run('saveLog')({ preventDefault() {} });
  s.deps.loadSequence.current++; finish(saved); await pending; assert.deepEqual(s.state.logs, []); assert.equal(s.state.resets, 0);
});
test('editing a visible journal without notification does not make it private', async () => {
  const s = screen(); s.deps.editingId = id; s.deps.logs = [{ ...saved, is_parent_visible: true }]; s.deps.notifyParent = false;
  await s.run('saveLog')({ preventDefault() {} }); assert.equal(s.state.saveArgs[2], true); assert.equal(s.state.notices, 0);
});
test('unknown save cannot send notifications or clear the form', async () => {
  const s = screen({ write: async () => { throw new AppError('JOURNAL_SAVE_UNCONFIRMED'); } }); await s.run('saveLog')({ preventDefault() {} });
  assert.equal(s.state.notices, 0); assert.equal(s.state.resets, 0); assert.equal(s.deps.mutationInFlight.current, false);
});
test('notification failure is explicitly a saved-journal warning', async () => {
  const s = screen({ notice: async () => { throw new AppError('PERMISSION_DENIED'); } }); await s.run('notifySavedStudy')(id, false);
  assert.equal(s.state.errors[0].code, 'JOURNAL_NOTIFICATION_FAILED'); assert.equal(s.state.alerts.length, 0);
});
test('notification response does not claim device receipt when push failed', async () => {
  const s = screen(); await s.run('notifySavedStudy')(id, false); assert.match(s.state.alerts[0], /실패 1건/); assert.match(s.state.alerts[0], /수신을 보장/);
});
for (const name of ['publishLog', 'deleteLog']) test(name + ' blocks duplicate prompts and releases the shared lock', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) }); const arg = name === 'deleteLog' ? id : saved;
  const pending = s.run(name)(arg); await s.run(name)(arg); assert.equal(s.state.prompts, 1); assert.equal(s.state.writes, 1); finish(); await pending; assert.equal(s.deps.mutationInFlight.current, false);
});
test('publish cannot notify when the returned write is unconfirmed', async () => {
  const s = screen({ write: async () => { throw new AppError('JOURNAL_SAVE_UNCONFIRMED'); } }); await s.run('publishLog')(saved); assert.equal(s.state.notices, 0);
});
test('delete cannot remove the displayed row on an unconfirmed response', async () => {
  const s = screen({ write: async () => { throw new AppError('JOURNAL_DELETE_UNCONFIRMED'); } }); s.state.logs = [saved]; await s.run('deleteLog')(id); assert.deepEqual(s.state.logs, [saved]);
});
const app = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('new journal messages match the app catalog', { skip: !existsSync(app) }, () => {
  const text = readFileSync(app, 'utf8'); for (const code of ['JOURNAL_SAVE_UNCONFIRMED', 'JOURNAL_DELETE_UNCONFIRMED']) assert.equal(text.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
