import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { saveAdminSiteSettings } from '../src/pages/admin/site/api/settingsWrite.ts';
import { prepareSiteSettings } from '../src/pages/admin/site/model/settings.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const ack = patch => ({ data: { id: 'default', lite_monthly_price: 39900, pro_monthly_price: 99000, ...patch }, error: null });
function mock(reply = ack()) {
  const calls = []; const q = {};
  for (const method of ['upsert', 'select', 'single']) q[method] = (...args) => { calls.push([method, ...args]); return q; };
  q.then = (yes, no) => Promise.resolve().then(() => { if (reply instanceof Error) throw reply; return reply; }).then(yes, no);
  return { calls, now: () => '2026-11-26T01:00:00Z', client: { from: table => { calls.push(['from', table]); return q; } } };
}
test('one singleton write retains fields and confirms returned ID and amounts', async () => {
  const d = mock(); assert.deepEqual(await saveAdminSiteSettings('39900', '99000', d), { litePrice: 39900, proPrice: 99000 });
  assert.deepEqual(d.calls, [['from', 'web_settings'], ['upsert', { id: 'default', lite_monthly_price: 39900, pro_monthly_price: 99000, updated_at: '2026-11-26T01:00:00Z' }], ['select', 'id,lite_monthly_price,pro_monthly_price'], ['single']]);
});
test('numeric strings in returned PostgreSQL numeric columns are accepted', async () => {
  assert.deepEqual(await saveAdminSiteSettings('39900', '99000', mock(ack({ lite_monthly_price: '39900', pro_monthly_price: '99000' }))), { litePrice: 39900, proPrice: 99000 });
  assert.deepEqual(await saveAdminSiteSettings('39900', '99000', mock(ack({ lite_monthly_price: '39900.00', pro_monthly_price: '99000.0' }))), { litePrice: 39900, proPrice: 99000 });
});
test('unsafe or empty price cannot start any write', async () => {
  for (const value of ['', ' ', '0', '-1', '1.5', '1e3', '+2', '1,000', 'Infinity', 'NaN', '9007199254740992']) {
    for (const args of [[value, '99000'], ['39900', value]]) { const d = mock(); await assert.rejects(saveAdminSiteSettings(...args, d), e => e.code === 'ADMIN_SETTINGS_INPUT_INVALID'); assert.equal(d.calls.length, 0); }
  }
  assert.deepEqual(prepareSiteSettings(' 0039900 ', '99000'), { litePrice: 39900, proPrice: 99000 });
});
for (const code of ['42501', 'PGRST202']) test(code + ' stays safe with no retry or alternate write', async () => {
  const d = mock({ data: null, error: { code, message: 'private token' } }); await assert.rejects(saveAdminSiteSettings('39900', '99000', d), e => e.code === (code === '42501' ? 'PERMISSION_DENIED' : 'SERVER_UPDATE_REQUIRED') && !e.message.includes('private'));
  assert.equal(d.calls.filter(c => c[0] === 'upsert').length, 1);
});
test('lost response, missing row and wrong acknowledgement never claim saved or retry', async () => {
  for (const reply of [new Error('private'), { data: null }, ack({ id: 'wrong' }), ack({ lite_monthly_price: 1 }), ack({ pro_monthly_price: null }), ack({ pro_monthly_price: {} })]) {
    const d = mock(reply); await assert.rejects(saveAdminSiteSettings('39900', '99000', d), e => e.code === 'ADMIN_SETTINGS_SAVE_UNCONFIRMED'); assert.equal(d.calls.filter(c => c[0] === 'upsert').length, 1);
  }
});
const source = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }) + '\nreturn handler;')(...Object.values(deps)); }
function screen(save) {
  const state = { writes: 0, errors: [], success: '', ready: true, busy: false, reloads: 0 };
  const profile = { role: 'admin' };
  const deps = { AppError, prepareSiteSettings, profile, settingsReadReady: true, loading: false, litePrice: '39900', proPrice: '99000', supabase: {},
    settingsSaveInFlight: { current: false }, contentViewEpoch: { current: 1 }, contentActiveView: { current: { profile, subTab: 'settings' } }, contentReadRequest: { current: { settings: 1 } },
    setSettingsSaving: value => { state.busy = value; }, setSaveMsg: value => { state.success = value; }, setSettingsReadReady: value => { state.ready = value; deps.settingsReadReady = value; },
    setLitePrice: value => { state.lite = value; }, setProPrice: value => { state.pro = value; }, handleError: async (e, code) => { state.errors.push(e instanceof AppError ? e.code : code); },
    saveAdminSiteSettings: async (...args) => { state.writes++; return save ? save(...args) : { litePrice: 39900, proPrice: 99000 }; },
    loadSettings: async () => { state.reloads++; },
  };
  return { state, deps, run: () => compile('handleSaveSettings', deps)() };
}
test('confirmed save updates form and message only after response', async () => {
  const s = screen(); await s.run(); assert.equal(s.state.writes, 1); assert.match(s.state.success, /응답을 확인/); assert.equal(s.state.lite, '39900'); assert.equal(s.state.busy, false); assert.equal(s.deps.contentReadRequest.current.settings, 2);
});
test('duplicate click before rerender cannot make a second write', async () => {
  let finish; const s = screen(() => new Promise(yes => { finish = yes; })); const pending = s.run(); await s.run(); assert.equal(s.state.writes, 1);
  finish({ litePrice: 39900, proPrice: 99000 }); await pending; assert.equal(s.deps.settingsSaveInFlight.current, false); assert.equal(s.state.busy, false);
});
test('invalid input never locks or writes and remains editable', async () => {
  const s = screen(); s.deps.litePrice = ''; await s.run(); assert.equal(s.state.writes, 0); assert.equal(s.state.ready, true); assert.deepEqual(s.state.errors, ['ADMIN_SETTINGS_INPUT_INVALID']); assert.equal(s.state.busy, false);
});
test('load failure/loading/previous-write lock prevents saves', async () => {
  for (const change of ['unready', 'loading', 'locked']) { const s = screen(); if (change === 'unready') s.deps.settingsReadReady = false; if (change === 'loading') s.deps.loading = true; if (change === 'locked') s.deps.settingsSaveInFlight.current = true;
    await s.run(); assert.equal(s.state.writes, 0);
  }
});
test('non-admin or prior tab/profile callback cannot save', async () => {
  const s = screen(); s.deps.profile.role = 'director'; await s.run(); assert.equal(s.state.writes, 0); assert.deepEqual(s.state.errors, ['PERMISSION_DENIED']);
  for (const change of ['tab', 'profile']) { const stale = screen(); if (change === 'tab') stale.deps.contentActiveView.current.subTab = 'videos'; else stale.deps.contentActiveView.current.profile = { role: 'admin' }; await stale.run(); assert.equal(stale.state.writes, 0); }
});
test('unknown response disables repeat save until fresh read rather than declaring failure/rollback', async () => {
  const s = screen(() => { throw new Error('private'); }); await s.run(); assert.equal(s.state.ready, false); assert.equal(s.state.success, ''); assert.deepEqual(s.state.errors, ['ADMIN_SETTINGS_SAVE_UNCONFIRMED']);
  await s.run(); assert.equal(s.state.writes, 1); assert.equal(s.state.reloads, 0); assert.equal(s.state.busy, false);
});
test('scope change during save cannot overwrite newer form or show stale success/error', async () => {
  for (const error of [false, true]) { let finish, fail; const s = screen(() => new Promise((yes, no) => { finish = yes; fail = no; })); const pending = s.run(); s.deps.contentViewEpoch.current++;
    if (error) fail(new Error('private')); else finish({ litePrice: 39900, proPrice: 99000 }); await pending;
    assert.equal(s.state.lite, undefined); assert.equal(s.state.success, ''); assert.deepEqual(s.state.errors, []); assert.equal(s.state.busy, false); assert.equal(s.state.reloads, 1);
  }
});
test('settings reader blocks form overwrite during write; controls use handler and pending state', async () => {
  const s = screen(); s.deps.settingsSaveInFlight.current = true;
  const read = compile('loadSettings', { ...s.deps, useCallback: fn => fn }); await read();
  assert.match(source, /onClick=\{handleSaveSettings\}/); assert.match(source, /disabled=\{!settingsReadReady \|\| settingsSaving\}/);
  assert.doesNotMatch(handlers.get('handleSaveSettings'), /supabase\.from/);
});
test('settings write error messages match app', () => {
  const app = readFileSync(new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8');
  for (const code of ['ADMIN_SETTINGS_INPUT_INVALID', 'ADMIN_SETTINGS_SAVE_UNCONFIRMED']) assert.equal(app.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
