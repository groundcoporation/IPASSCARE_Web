import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { saveNoticeRecord, deleteNoticeRecord } from '../src/pages/admin/notices/api/noticeWrites.ts';
import { validateNoticeWrite } from '../src/pages/admin/notices/model/noticeWrite.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const id = '11111111-1111-4111-8111-111111111111'; const writerId = '22222222-2222-4222-8222-222222222222';
const writer = patch => ({ id: writerId, role: 'admin', name: 'Synthetic writer', branch_id: 'branch', ...patch });
const form = patch => ({ title: ' Test ', content: ' Body ', important: false, onHome: true, branchId: 'branch', sendPush: false, ...patch });
function mock(options = {}) {
  const calls = []; let values; const q = {};
  for (const method of ['insert', 'update', 'delete', 'eq', 'is', 'select', 'single']) q[method] = (...args) => { calls.push([method, ...args]); if (method === 'insert') values = args[0][0]; if (method === 'update') values = args[0]; return q; };
  q.then = (yes, no) => Promise.resolve().then(() => { if (options.row instanceof Error) throw options.row; return options.row ?? { data: { ...values, id }, error: null }; }).then(yes, no);
  return { calls, now: () => '2026-11-26T01:00:00Z', client: {
    from: table => { calls.push(['table', table]); return q; },
    auth: { getUser: async () => { calls.push(['auth']); return options.auth ?? { data: { user: { id: writerId, email: 'synthetic@example.invalid', user_metadata: {} } }, error: null }; } },
    functions: { invoke: async (...args) => { calls.push(['push', ...args]); if (options.push instanceof Error) throw options.push; return options.push ?? { data: { success: true, targetCount: 2, sentCount: 2, failedCount: 0 } }; } },
  } };
}
for (const kind of ['branch', 'hq']) {
  test(kind + ' save confirms full row/ID with existing fields and only one write', async () => {
    const d = mock(); const r = await saveNoticeRecord(kind, form(), null, writer(), d); assert.equal(r.id, id); assert.equal(r.pushIssue, null); assert.equal(d.calls.filter(c => c[0] === 'insert').length, 1);
    const payload = d.calls.find(c => c[0] === 'insert')[1][0]; assert.equal(payload.title, 'Test'); assert.equal(payload.content, 'Body');
    if (kind === 'branch') { assert.equal(payload.author_id, writerId); assert.equal(payload.branch_id, 'branch'); assert.equal(payload.is_on_home, true); }
    else { assert.equal(payload.author_name, '아이패스케어 본사'); assert.equal('branch_id' in payload, false); assert.equal(payload.created_at, '2026-11-26T01:00:00Z'); }
  });
  test(kind + ' invalid/missing auth cannot write or notify', async () => {
    for (const auth of [{ data: { user: null } }, { data: { user: { id } } }, { error: { code: '42501', message: 'private' } }]) {
      const d = mock({ auth }); await assert.rejects(saveNoticeRecord(kind, form({ sendPush: true }), null, writer(), d)); assert.equal(d.calls.some(c => c[0] === 'table' || c[0] === 'push'), false);
    }
  });
  test(kind + ' unknown/mismatched save never triggers notification or fallback', async () => {
    for (const row of [new Error('private'), { data: null }, { data: { id } }, { error: { code: '42501', message: 'private' } }]) {
      const d = mock({ row }); await assert.rejects(saveNoticeRecord(kind, form({ sendPush: true }), null, writer(), d), e => !e.message.includes('private')); assert.equal(d.calls.filter(c => c[0] === 'insert').length, 1); assert.equal(d.calls.some(c => c[0] === 'push'), false);
    }
  });
  test(kind + ' deletion validates returned row and never calls push', async () => {
    const d = mock({ row: { data: { id } } }); await deleteNoticeRecord(kind, { id, branchId: 'branch' }, writer(), d); assert.equal(d.calls.filter(c => c[0] === 'delete').length, 1); assert.equal(d.calls.some(c => c[0] === 'push'), false);
    await assert.rejects(deleteNoticeRecord(kind, { id, branchId: null }, writer(), mock({ row: { data: null } })), e => e.code === 'NOTICE_WRITE_UNCONFIRMED');
  });
}
test('ordinary update scopes original branch and keeps no-push-on-edit policy', async () => {
  const d = mock(); const r = await saveNoticeRecord('branch', form({ sendPush: true }), { id, branchId: null }, writer(), d); assert.equal(r.pushResult, null); assert.ok(d.calls.some(c => c[0] === 'is' && c[1] === 'branch_id' && c[2] === null)); assert.equal(d.calls.some(c => c[0] === 'push'), false);
});
test('only requested new ordinary notice notifies after confirmation; HQ/opt-out never invoke', async () => {
  const d = mock(); const r = await saveNoticeRecord('branch', form({ sendPush: true }), null, writer(), d); assert.equal(r.pushResult.sentCount, 2); assert.deepEqual(d.calls.at(-1), ['push', 'send-notice-push', { body: { noticeId: id } }]);
  for (const [kind, push] of [['hq', true], ['branch', false]]) { const no = mock(); await saveNoticeRecord(kind, form({ sendPush: push }), null, writer(), no); assert.equal(no.calls.some(c => c[0] === 'push'), false); }
});
test('notification partial/unknown/error preserves saved ID and never resaves or retries', async () => {
  for (const push of [new Error('private'), { data: null }, { data: { success: false, error: 'private' } }, { data: { success: true } }, { data: { success: true, targetCount: 2, sentCount: 1, failedCount: 1 } }]) {
    const d = mock({ push }); const r = await saveNoticeRecord('branch', form({ sendPush: true }), null, writer(), d); assert.equal(r.id, id); assert.equal(r.pushIssue.code, 'NOTICE_PUSH_PARTIAL'); assert.equal(d.calls.filter(c => c[0] === 'insert').length, 1); assert.equal(d.calls.filter(c => c[0] === 'push').length, 1);
  }
});
test('role/branch/required input/target validation does not call auth or DB', async () => {
  const cases = [['hq', form(), null, writer({ role: 'director' })], ['branch', form({ branchId: null }), null, writer({ role: 'teacher' })], ['branch', form(), { id, branchId: null }, writer({ role: 'teacher' })], ['branch', form({ title: '' }), null, writer()], ['branch', form(), { id: 'bad', branchId: null }, writer()]];
  for (const args of cases) { const d = mock(); await assert.rejects(saveNoticeRecord(...args, d)); assert.equal(d.calls.length, 0); }
});
function definitions(kind) {
  const text = readFileSync(new URL(`../src/pages/admin/notices/views/${kind === 'branch' ? 'AdminNoticeTab' : 'AdminHqNoticeTab'}.tsx`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(kind, text, ts.ScriptTarget.Latest, true); const defs = new Map(); function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) defs.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast); return { text, defs };
}
function screen(kind, options = {}) {
  const state = { saves: 0, deletes: 0, reads: 0, errors: [], alerts: [], closes: 0, busy: false }; const profile = writer();
  const deps = { AppError, validateNoticeWrite, profile, activeBranchId: 'branch', noticeActiveView: { current: { profile, activeBranchId: 'branch' } }, noticeFormEpoch: { current: 0 }, noticeMounted: { current: true }, noticeWriteInFlight: { current: false }, noticeReviewRequired: { current: false }, noticeReadReady: { current: true }, noticeReadRequest: { current: 0 }, loading: false,
    notices: [{ id, branch_id: 'branch' }], branches: [{ id: 'branch' }], selectedNotice: null, title: 'Test', content: 'Body', isImportant: false, isOnHome: true, targetBranchId: 'branch', isSendNotification: true, supabase: {},
    setIsModalOpen: () => { state.closes++; }, setSelectedNotice() {}, setIsDetailOpen() {}, setSaveLoading: value => { state.busy = value; }, confirm: () => options.confirm !== false, alert: value => state.alerts.push(value), handleError: async (e, code) => state.errors.push(e instanceof AppError ? e.code : code),
    saveNoticeRecord: async () => { state.saves++; return options.save ? options.save() : { id, pushResult: null, pushIssue: null }; }, deleteNoticeRecord: async () => { state.deletes++; },
  };
  const read = async () => { state.reads++; if (options.refreshError) throw new AppError('NOTICE_REFRESH_FAILED'); };
  deps.loadNotices = read; deps.loadHqNotices = read; deps.latestNoticeLoad = { current: read };
  const { defs, text } = definitions(kind);
  const runName = name => new Function(...Object.keys(deps), ts.transpile('const handler = ' + defs.get(name) + '; return handler;', { target: ts.ScriptTarget.ES2022 }))(...Object.values(deps));
  return { state, deps, text, run: (mode = 'save', target = null) => runName('executeNoticeWrite')(mode, target), handler: runName };
}
for (const kind of ['branch', 'hq']) {
  test(kind + ' confirmed save closes then refreshes and shared lock prevents repeated save/delete', async () => {
    let finish; const s = screen(kind, { save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); await s.run(); await s.run('delete', id); assert.equal(s.state.saves, 1); assert.equal(s.state.deletes, 0); finish({ id, pushIssue: null, pushResult: null }); await pending; assert.equal(s.state.closes, 1); assert.equal(s.state.reads, 1); assert.equal(s.state.busy, false);
  });
  test(kind + ' unknown write preserves form and blocks repeats before fresh read', async () => {
    const s = screen(kind, { save: () => { throw new Error('private'); } }); await s.run(); await s.run(); assert.equal(s.state.saves, 1); assert.equal(s.state.closes, 0); assert.equal(s.state.reads, 0); assert.equal(s.deps.noticeReviewRequired.current, true);
  });
  test(kind + ' refresh failure is separate from write error', async () => {
    const s = screen(kind, { refreshError: true }); await s.run(); assert.deepEqual(s.state.errors, ['NOTICE_REFRESH_FAILED']); assert.equal(s.state.saves, 1);
  });
  test(kind + ' scope epoch/unmount cannot close new form and only mounted latest scope reloads', async () => {
    for (const unmount of [false, true]) { let finish; const s = screen(kind, { save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); s.deps.noticeFormEpoch.current++; if (unmount) s.deps.noticeMounted.current = false; finish({ id, pushIssue: null }); await pending; assert.equal(s.state.closes, 0); assert.equal(s.state.alerts.length, 0); assert.equal(s.state.reads, unmount ? 0 : 1); }
  });
  test(kind + ' delete cancellation, invalid target and unready input do not write', async () => {
    const cancel = screen(kind, { confirm: false }); await cancel.run('delete', id); assert.equal(cancel.state.deletes, 0);
    const invalid = screen(kind); await invalid.run('delete', 'missing'); assert.equal(invalid.state.deletes, 0); assert.deepEqual(invalid.state.errors, ['NOTICE_INPUT_INVALID']);
    const unready = screen(kind); unready.deps.noticeReadReady.current = false; await unready.run(); assert.equal(unready.state.saves, 0);
  });
  test(kind + ' close/editor controls are locked during write', () => {
    const s = screen(kind); s.deps.noticeWriteInFlight.current = true; s.handler('closeNoticeEditor')(); assert.equal(s.state.closes, 0); assert.match(s.text, /<fieldset disabled=\{saveLoading \|\| loading \|\| !noticeReadReady.current\}/);
  });
}
test('saved notice with push issue closes form and refreshes without treating it as save failure', async () => {
  const s = screen('branch', { save: () => ({ id, pushIssue: new AppError('NOTICE_PUSH_PARTIAL'), pushResult: { sentCount: 1, failedCount: 1 } }) }); await s.run(); assert.equal(s.state.closes, 1); assert.equal(s.state.reads, 1); assert.deepEqual(s.state.errors, ['NOTICE_PUSH_PARTIAL']); assert.equal(s.deps.noticeReviewRequired.current, false);
});
test('notice write error messages match app catalog', () => {
  const app = readFileSync(new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8');
  for (const code of ['NOTICE_INPUT_INVALID', 'NOTICE_WRITE_UNCONFIRMED', 'NOTICE_PUSH_PARTIAL', 'NOTICE_REFRESH_FAILED']) assert.equal(app.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
