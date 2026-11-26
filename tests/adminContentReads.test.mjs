import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { loadAdminContentList, loadAdminSiteSettings } from '../src/pages/admin/site/api/contentReads.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
function mock(response) {
  const calls = []; return { calls, client: { from(table) {
    calls.push(['from', table]); const q = {};
    for (const method of ['select', 'order', 'eq', 'maybeSingle']) q[method] = (...args) => { calls.push([method, ...args]); return q; };
    q.then = (yes, no) => Promise.resolve().then(() => { if (response instanceof Error) throw response; return response; }).then(yes, no); return q;
  } } };
}
for (const [kind, table, order, ascending] of [['inquiries', 'web_inquiries', 'created_at', false], ['videos', 'web_manual_videos', 'created_at', false], ['partners', 'web_partner_logos', 'display_order', true]]) {
  test(kind + ' retains table, fields, order and empty-list contract without writes', async () => {
    const d = mock({ data: [], error: null }); assert.deepEqual(await loadAdminContentList(kind, d), []);
    assert.deepEqual(d.calls, [['from', table], ['select', '*'], ['order', order, { ascending }]]);
  });
  test(kind + ' response error is safe and never retries', async () => {
    const d = mock({ data: [], error: { code: '42501', message: 'private token' } }); await assert.rejects(loadAdminContentList(kind, d), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private')); assert.equal(d.calls.filter(c => c[0] === 'from').length, 1);
  });
  test(kind + ' malformed/lost responses do not turn into empty success', async () => {
    for (const value of [null, {}, [null], [[]]]) { const d = mock({ data: value }); await assert.rejects(loadAdminContentList(kind, d), e => e.code === 'ADMIN_CONTENT_LOAD_FAILED'); }
    await assert.rejects(loadAdminContentList(kind, mock(new Error('private'))), e => e.code === 'ADMIN_CONTENT_LOAD_FAILED');
  });
}
test('invalid resource cannot select an arbitrary table or prototype property', async () => {
  for (const kind of ['users', '__proto__', 'constructor', '']) { const d = mock({ data: [] }); await assert.rejects(loadAdminContentList(kind, d), e => e.code === 'INPUT_INVALID'); assert.equal(d.calls.length, 0); }
});
test('settings retains default singleton query and converts existing values for form', async () => {
  const d = mock({ data: { lite_monthly_price: 39900, pro_monthly_price: '99000' }, error: null }); assert.deepEqual(await loadAdminSiteSettings(d), { litePrice: '39900', proPrice: '99000' });
  assert.deepEqual(d.calls, [['from', 'web_settings'], ['select', '*'], ['eq', 'id', 'default'], ['maybeSingle']]);
});
test('missing settings/zero values preserve legacy fallback rather than silently changing pricing policy', async () => {
  for (const data of [null, {}, { lite_monthly_price: 0, pro_monthly_price: '' }]) assert.deepEqual(await loadAdminSiteSettings(mock({ data })), { litePrice: '99000', proPrice: '118000' });
});
test('settings errors, malformed fields and unexpected body do not become defaults', async () => {
  await assert.rejects(loadAdminSiteSettings(mock({ error: { code: '42501', message: 'private' } })), e => e.code === 'PERMISSION_DENIED');
  for (const data of [undefined, [], 'body', { lite_monthly_price: {} }, { pro_monthly_price: [] }]) await assert.rejects(loadAdminSiteSettings(mock({ data })), e => e.code === 'ADMIN_CONTENT_LOAD_FAILED');
});
const source = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }) + '\nreturn handler;')(...Object.values(deps)); }
const methods = { inquiries: 'loadInquiries', settings: 'loadSettings', videos: 'loadVideos', partners: 'loadPartners' };
function screen(kind, read) {
  const state = { data: null, busy: [], errors: [], reads: 0, ready: false, partnerError: false };
  const profile = { role: 'admin' };
  const deps = { AppError, useCallback: fn => fn, profile, supabase: {}, contentActiveView: { current: { profile, subTab: kind } },
    contentViewEpoch: { current: 0 }, settingsSaveInFlight: { current: false }, videoWriteInFlight: { current: false }, videoReadReady: { current: false }, videoReviewRequired: { current: false }, partnerWriteInFlight: { current: false }, partnerReadReady: { current: false }, partnerReviewRequired: { current: false }, contentReadRequest: { current: { inquiries: 0, settings: 0, videos: 0, partners: 0 } },
    setLoading: v => state.busy.push(v), setInquiries: v => { state.data = v; }, setVideos: v => { state.data = v; }, setPartners: v => { state.data = v; },
    setLitePrice: v => { state.lite = v; }, setProPrice: v => { state.pro = v; }, setSaveMsg: () => {}, setSettingsReadReady: v => { state.ready = v; }, setPartnerTableError: v => { state.partnerError = v; },
    handleError: async (e, code) => state.errors.push(e instanceof AppError ? e.code : code),
  };
  const runRead = async () => { state.reads++; return read ? read() : kind === 'settings' ? { litePrice: '1', proPrice: '2' } : [{ id: 'test' }]; };
  deps.loadAdminContentList = runRead; deps.loadAdminSiteSettings = runRead;
  return { state, deps, run: () => compile(methods[kind], deps)() };
}
for (const kind of Object.keys(methods)) {
  test(kind + ' current response updates only intended state and releases loading', async () => {
    const s = screen(kind); await s.run(); assert.equal(s.state.reads, 1); assert.deepEqual(s.state.busy, [true, false]);
    if (kind === 'settings') { assert.equal(s.state.lite, '1'); assert.equal(s.state.ready, true); } else assert.deepEqual(s.state.data, [{ id: 'test' }]);
  });
  test(kind + ' current failure clears list/disables settings and uses common error', async () => {
    const s = screen(kind, () => { throw new Error('private phone'); }); await s.run(); assert.deepEqual(s.state.errors, ['ADMIN_CONTENT_LOAD_FAILED']); assert.equal(s.state.busy.at(-1), false);
    if (kind === 'settings') assert.equal(s.state.ready, false); else assert.deepEqual(s.state.data, []);
    if (kind === 'partners') assert.equal(s.state.partnerError, true);
  });
  test(kind + ' old success/error after tab switch cannot overwrite state or release current loading', async () => {
    for (const failure of [false, true]) {
      let finish, fail; const s = screen(kind, () => new Promise((yes, no) => { finish = yes; fail = no; })); const pending = s.run(); s.deps.contentViewEpoch.current++;
      if (failure) fail(new Error('private')); else finish(kind === 'settings' ? { litePrice: '1', proPrice: '2' } : [{ id: 'old' }]);
      await pending; assert.equal(s.state.data, null); assert.equal(s.state.lite, undefined); assert.deepEqual(s.state.errors, []); assert.deepEqual(s.state.busy, [true]);
    }
  });
  test(kind + ' same-resource overlapping query keeps only newest response', async () => {
    const finish = []; const s = screen(kind, () => new Promise(yes => finish.push(yes))); const first = s.run(); const second = s.run();
    finish[1](kind === 'settings' ? { litePrice: 'new', proPrice: 'new' } : [{ id: 'new' }]); await second;
    finish[0](kind === 'settings' ? { litePrice: 'old', proPrice: 'old' } : [{ id: 'old' }]); await first;
    assert.equal(kind === 'settings' ? s.state.lite : s.state.data[0].id, 'new');
  });
  test(kind + ' non-admin denied and delayed callback from prior tab/profile cannot start a read', async () => {
    const denied = screen(kind); denied.deps.profile.role = 'director'; await denied.run(); assert.equal(denied.state.reads, 0); assert.deepEqual(denied.state.errors, ['PERMISSION_DENIED']);
    for (const change of ['tab', 'profile']) { const s = screen(kind); if (change === 'tab') s.deps.contentActiveView.current.subTab = 'elsewhere'; else s.deps.contentActiveView.current.profile = { role: 'admin' };
      await s.run(); assert.equal(s.state.reads, 0); assert.deepEqual(s.state.busy, []);
    }
  });
}
test('settings save disabled until read succeeds; cleanup resets readiness and invalidates all resource readers', () => {
  assert.match(source, /disabled=\{!settingsReadReady \|\| loading \|\| settingsSaving\}/);
  assert.match(source, /contentViewEpoch\.current \+= 1;\s*setSettingsReadReady\(false\);\s*videoReadReady.current = false;\s*partnerReadReady.current = false;\s*\}, \[profile, subTab\]/);
  for (const name of Object.values(methods)) assert.doesNotMatch(handlers.get(name), /supabase\.from|console\.|error\.message/);
});
test('admin read error catalog matches app', () => {
  const app = readFileSync(new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8'); assert.equal(app.match(/ADMIN_CONTENT_LOAD_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.ADMIN_CONTENT_LOAD_FAILED);
});
