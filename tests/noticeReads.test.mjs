import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadNoticeList, loadHeadquarterNotices } from '../src/pages/admin/notices/api/noticeReads.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const row = patch => ({ id: 'n1', title: 'Test', content: 'Synthetic', is_important: false, author_name: null, created_at: '2026-11-26', updated_at: null, ...patch });
function mock(reply) {
  const calls = []; const q = {};
  for (const method of ['select', 'or', 'order']) q[method] = (...args) => { calls.push([method, ...args]); return q; };
  q.then = (yes, no) => Promise.resolve().then(() => { if (reply instanceof Error) throw reply; return reply ?? { data: [row()], error: null }; }).then(yes, no);
  return { calls, client: { from: table => { calls.push(['from', table]); return q; } } };
}
test('branch notice read retains selected/global scope and importance/date sorting', async () => {
  const d = mock(); await loadNoticeList('branch-a', d); assert.deepEqual(d.calls, [['from', 'notices'], ['select', '*'], ['or', 'branch_id.eq.branch-a,branch_id.is.null'], ['order', 'is_important', { ascending: false }], ['order', 'created_at', { ascending: false }]]);
});
test('explicit null scope retains admin all-branch query and invalid filter syntax cannot query', async () => {
  const d = mock(); await loadNoticeList(null, d); assert.equal(d.calls.some(c => c[0] === 'or'), false);
  for (const branch of ['', 'all', 'branch),id.gt.0', 'a.b', 'a,b']) { const bad = mock(); await assert.rejects(loadNoticeList(branch, bad), e => e.code === 'INPUT_INVALID'); assert.equal(bad.calls.length, 0); }
});
test('HQ read targets only dedicated table without synthetic fallback or secondary query', async () => {
  const d = mock({ data: [], error: null }); assert.deepEqual(await loadHeadquarterNotices(d), []); assert.deepEqual(d.calls[0], ['from', 'headquarter_notices']); assert.equal(d.calls.filter(c => c[0] === 'from').length, 1);
});
for (const kind of ['branch', 'hq']) {
  const run = d => kind === 'branch' ? loadNoticeList('branch-a', d) : loadHeadquarterNotices(d);
  test(kind + ' errors and malformed records never return partial/default success', async () => {
    await assert.rejects(run(mock({ data: [row()], error: { code: '42501', message: 'private token' } })), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private'));
    for (const data of [null, {}, [null], [row({ title: null })], [row({ content: {} })]]) await assert.rejects(run(mock({ data })), e => e.code === 'NOTICE_LOAD_FAILED');
  });
  test(kind + ' network loss has one request and no automatic retry', async () => { const d = mock(new Error('private')); await assert.rejects(run(d), e => e.code === 'NOTICE_LOAD_FAILED'); assert.equal(d.calls.filter(c => c[0] === 'from').length, 1); });
}
function readSource(kind) {
  const path = kind === 'branch' ? 'AdminNoticeTab' : 'AdminHqNoticeTab'; const source = readFileSync(new URL(`../src/pages/admin/notices/views/${path}.tsx`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true); const map = new Map(); let effect;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) map.set(n.name.getText(ast), n.initializer.getText(ast)); if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') effect = n.arguments[0].getText(ast); ts.forEachChild(n, visit); } visit(ast);
  return { source, map, effect, name: kind === 'branch' ? 'loadNotices' : 'loadHqNotices' };
}
function screen(kind, read) {
  const def = readSource(kind); const profile = { id: 'user', role: 'director', branch_id: 'branch-a' };
  const state = { rows: null, selected: null, busy: [], errors: [], reads: [], modal: true, detail: true };
  const deps = { AppError, useCallback: fn => fn, profile, activeBranchId: 'branch-filter', noticeReadRequest: { current: 0 }, noticeActiveView: { current: { profile, activeBranchId: 'branch-filter' } }, supabase: {},
    noticeMounted: { current: true }, noticeFormEpoch: { current: 0 }, noticeWriteInFlight: { current: false }, noticeReviewRequired: { current: false }, noticeReadReady: { current: false }, latestNoticeLoad: { current: null },
    setLoading: v => state.busy.push(v), setNotices: v => { state.rows = v; }, setSelectedNotice: v => { state.selected = typeof v === 'function' ? v(state.selected) : v; }, setIsModalOpen: v => { state.modal = v; }, setIsDetailOpen: v => { state.detail = v; }, handleError: async (e, code) => state.errors.push(e instanceof AppError ? e.code : code),
    loadNoticeList: async (...args) => { state.reads.push(args); return read ? read() : [row()]; }, loadHeadquarterNotices: async (...args) => { state.reads.push(args); return read ? read() : [row()]; },
  };
  const code = ts.transpile(`const ${def.name} = ${def.map.get(def.name)}; const effect = ${def.effect}; return { run: ${def.name}, mount: effect };`, { target: ts.ScriptTarget.ES2022 });
  const handlers = new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { state, deps, ...handlers, def };
}
for (const kind of ['branch', 'hq']) {
  test(kind + ' current successful response refreshes selection without adding selection to dependencies', async () => {
    const s = screen(kind); s.state.selected = row({ title: 'old' }); await s.run(); assert.equal(s.state.rows[0].title, 'Test'); assert.equal(s.state.selected.title, 'Test'); assert.equal(s.state.busy.at(-1), false);
    assert.doesNotMatch(s.def.map.get(s.def.name), /\[.*selectedNotice/);
  });
  test(kind + ' old success/error cannot overwrite latest list, selection or loading', async () => {
    for (const failure of [false, true]) {
      let finish, fail; const s = screen(kind, () => new Promise((yes, no) => { finish = yes; fail = no; })); const pending = s.run(); s.deps.noticeReadRequest.current++;
      if (failure) fail(new Error('private')); else finish([row()]); await pending; assert.equal(s.state.rows, null); assert.equal(s.state.selected, null); assert.deepEqual(s.state.errors, []); assert.deepEqual(s.state.busy, [true]);
    }
  });
  test(kind + ' current failure clears old notice/details and shows safe error', async () => {
    const s = screen(kind, () => { throw new Error('private'); }); s.state.selected = row(); await s.run(); assert.deepEqual(s.state.rows, []); assert.equal(s.state.selected, null); assert.deepEqual(s.state.errors, ['NOTICE_LOAD_FAILED']);
  });
  test(kind + ' profile switch/unmount invalidates response and closes previous edit/detail', async () => {
    let finish; const s = screen(kind, () => new Promise(yes => { finish = yes; })); const cleanup = s.mount(); cleanup(); finish([row()]); await new Promise(resolve => setImmediate(resolve)); assert.equal(s.state.selected, null); assert.equal(s.state.rows, null); assert.equal(s.state.modal, false);
    if (kind === 'branch') assert.equal(s.state.detail, false);
  });
  test(kind + ' delayed reload from old write callback cannot query new profile scope', async () => {
    const s = screen(kind); s.deps.noticeActiveView.current.profile = { id: 'other' }; await s.run(); assert.equal(s.state.reads.length, 0); assert.deepEqual(s.state.busy, []);
  });
  test(kind + ' absent profile or unsupported role cannot query', async () => {
    for (const role of ['driver', 'user']) { const s = screen(kind); s.deps.profile.role = role; await s.run(); assert.equal(s.state.reads.length, 0); assert.deepEqual(s.state.errors, ['PERMISSION_DENIED']); }
    const s = screen(kind); s.deps.profile.id = ''; await s.run(); assert.equal(s.state.reads.length, 0); assert.deepEqual(s.state.errors, ['AUTH_REQUIRED']);
  });
}
test('non-admin reads own branch rather than filter; missing branch never widens to all', async () => {
  const s = screen('branch'); await s.run(); assert.equal(s.state.reads[0][0], 'branch-a');
  const denied = screen('branch'); denied.deps.profile.branch_id = null; await denied.run(); assert.equal(denied.state.reads.length, 0); assert.deepEqual(denied.state.errors, ['PERMISSION_DENIED']);
});
test('admin filter retains selected plus global and explicit all scope', async () => {
  const selected = screen('branch'); selected.deps.profile.role = 'admin'; await selected.run(); assert.equal(selected.state.reads[0][0], 'branch-filter');
  const all = screen('branch'); all.deps.profile.role = 'admin'; all.deps.activeBranchId = 'all'; all.deps.noticeActiveView.current.activeBranchId = 'all';
  // Compile captures primitives: render the same source with the updated dependency values.
  const js = ts.transpile('const run = ' + all.def.map.get('loadNotices') + '; return run;', { target: ts.ScriptTarget.ES2022 }); await new Function(...Object.keys(all.deps), js)(...Object.values(all.deps))(); assert.equal(all.state.reads[0][0], null);
});
test('HQ chooses first only when old selected row is absent; branch does not auto-open detail', async () => {
  const hq = screen('hq'); await hq.run(); assert.equal(hq.state.selected.id, 'n1');
  const branch = screen('branch'); await branch.run(); assert.equal(branch.state.selected, null);
});
test('read callbacks/effects have stable dependency wiring and no fabricated fallback/raw read logging', () => {
  for (const kind of ['branch', 'hq']) { const def = readSource(kind); assert.match(def.map.get(def.name), /^useCallback\(/); assert.match(def.source, new RegExp('\\}, \\[' + def.name + '\\]\\)')); assert.doesNotMatch(def.map.get(def.name), /supabase\.from|console\.|hq-launch/); }
  assert.doesNotMatch(readSource('hq').source, /fallbackList|hq-launch-1/);
});
test('notice read message matches app catalog', () => {
  const app = readFileSync(new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8'); assert.equal(app.match(/NOTICE_LOAD_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.NOTICE_LOAD_FAILED);
});
