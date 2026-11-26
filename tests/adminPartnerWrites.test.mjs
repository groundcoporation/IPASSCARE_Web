import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { saveAdminPartner, deleteAdminPartner } from '../src/pages/admin/site/api/partnerWrites.ts';
import { preparePartner, partnerFileExtension, isPartnerId } from '../src/pages/admin/site/model/partners.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';
const id = '11111111-1111-4111-8111-111111111111'; const token = '22222222-2222-4222-8222-222222222222';
const file = patch => ({ name: 'test.png', type: 'image/png', size: 10, ...patch });
const form = patch => ({ name: ' test ', description: ' desc ', logoUrl: 'https://example.invalid/old.png', order: '0', visible: true, file: null, ...patch });
function mock(options = {}) {
  const calls = []; let values; const q = {};
  for (const method of ['insert', 'update', 'delete', 'eq', 'select', 'single']) q[method] = (...args) => { calls.push([method, ...args]); if (method === 'insert') values = args[0][0]; if (method === 'update') values = args[0]; return q; };
  q.then = (yes, no) => Promise.resolve().then(() => { if (options.row instanceof Error) throw options.row; return options.row ?? { data: { ...values, id }, error: null }; }).then(yes, no);
  return { calls, uuid: () => token, client: { from: table => { calls.push(['table', table]); return q; }, storage: { from: bucket => { calls.push(['bucket', bucket]); return {
    upload: async (path, item, settings) => { calls.push(['upload', path, item, settings]); if (options.upload instanceof Error) throw options.upload; return options.upload ?? { data: { path }, error: null }; },
    getPublicUrl: path => { calls.push(['url', path]); return { data: { publicUrl: options.url ?? 'https://example.invalid/new.png' } }; },
  }; } } } };
}
test('preparation trims text and preserves visibility/signed order and existing logo', () => {
  assert.deepEqual(preparePartner(form({ order: '-2', visible: false })), { name: 'test', description: 'desc', logo_url: 'https://example.invalid/old.png', display_order: -2, is_visible: false }); assert.equal(preparePartner(form({ order: '' })).display_order, 0);
});
test('invalid names/order/unsafe logo/file cannot start upload or row write', async () => {
  for (const patch of [{ name: '' }, { order: '2x' }, { order: '1.5' }, { order: '2147483648' }, { logoUrl: 'data:image/png;base64,test' }, { file: file({ type: 'text/html' }) }, { file: file({ size: 0 }) }, { file: file({ size: 10485761 }) }]) {
    const d = mock(); const r = await saveAdminPartner(form(patch), null, d); assert.equal(r.stage, 'not_started'); assert.equal(r.issue.code, 'ADMIN_PARTNER_INPUT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
test('allowed image types use fixed extensions, never arbitrary filename suffixes', () => {
  assert.equal(partnerFileExtension(file({ name: '../../test.exe' })), 'png'); assert.equal(partnerFileExtension(file({ type: 'image/svg+xml' })), 'svg');
});
test('existing-logo edit performs one scoped row update without touching storage', async () => {
  const d = mock(); const r = await saveAdminPartner(form(), id, d); assert.equal(r.stage, 'confirmed'); assert.deepEqual(d.calls.find(c => c[0] === 'eq'), ['eq', 'id', id]); assert.equal(d.calls.some(c => c[0] === 'bucket'), false);
});
test('upload then insert confirms exact unique path with upsert false and does not delete any file', async () => {
  const d = mock(); const r = await saveAdminPartner(form({ file: file() }), null, d); assert.equal(r.stage, 'confirmed'); assert.equal(r.uploadedPath, `logos/${token}.png`);
  assert.deepEqual(d.calls.find(c => c[0] === 'upload').slice(1), [`logos/${token}.png`, file(), { upsert: false }]); assert.equal(d.calls.find(c => c[0] === 'insert')[1][0].logo_url, 'https://example.invalid/new.png'); assert.equal(d.calls.some(c => c[0] === 'remove'), false);
});
test('upload error/response loss/wrong path never starts row write or base64 fallback', async () => {
  for (const upload of [new Error('private'), { error: { code: '42501' } }, { data: null }, { data: { path: 'other' } }]) {
    const d = mock({ upload }); const r = await saveAdminPartner(form({ file: file() }), null, d); assert.equal(r.stage, 'upload_unconfirmed'); assert.ok(r.issue); assert.equal(d.calls.some(c => c[0] === 'table'), false); assert.ok(r.uploadedPath);
  }
});
test('bad public URL after upload reports partial and never saves invalid URL or removes file', async () => {
  const d = mock({ url: 'data:image/png;base64,unsafe' }); const r = await saveAdminPartner(form({ file: file() }), null, d); assert.equal(r.stage, 'uploaded'); assert.equal(r.issue.code, 'ADMIN_PARTNER_SAVE_PARTIAL'); assert.equal(d.calls.some(c => c[0] === 'table'), false);
});
test('DB failure/unknown response after upload retains uploaded metadata and never cleans potentially referenced file', async () => {
  for (const row of [new Error('private'), { error: { code: '42501', message: 'private' } }, { data: null }, { data: { id } }]) {
    const d = mock({ row }); const r = await saveAdminPartner(form({ file: file() }), null, d); assert.equal(r.stage, 'row_unconfirmed'); assert.ok(r.uploadedPath); assert.ok(r.issue); assert.equal(d.calls.filter(c => c[0] === 'upload').length, 1); assert.equal(d.calls.filter(c => c[0] === 'insert').length, 1);
  }
});
test('wrong updated ID cannot be accepted as success', async () => {
  const d = mock({ row: { data: { ...preparePartner(form()), id: token } } }); const r = await saveAdminPartner(form(), id, d); assert.equal(r.issue.code, 'ADMIN_PARTNER_WRITE_UNCONFIRMED');
});
test('delete checks returned UUID and never deletes existing/shared storage objects', async () => {
  const d = mock({ row: { data: { id } } }); await deleteAdminPartner(id, d); assert.deepEqual(d.calls, [['table', 'web_partner_logos'], ['delete'], ['eq', 'id', id], ['select', 'id'], ['single']]);
  for (const row of [{ data: null }, { data: { id: token } }, new Error('private')]) await assert.rejects(deleteAdminPartner(id, mock({ row })), e => e.code === 'ADMIN_PARTNER_WRITE_UNCONFIRMED');
});
test('invalid write/delete targets do not query', async () => {
  const d = mock(); assert.equal((await saveAdminPartner(form(), 'bad', d)).issue.code, 'ADMIN_PARTNER_INPUT_INVALID'); await assert.rejects(deleteAdminPartner('bad', d), e => e.code === 'ADMIN_PARTNER_INPUT_INVALID'); assert.equal(d.calls.length, 0);
});
const source = readFileSync(new URL('../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }) + '\nreturn handler;')(...Object.values(deps)); }
function screen(options = {}) {
  const state = { saves: 0, deletes: 0, errors: [], alerts: [], resets: 0, refresh: 0, busy: false }; const profile = { role: 'admin' };
  const deps = { AppError, preparePartner, isPartnerId, profile, loading: false, contentViewEpoch: { current: 0 }, contentActiveView: { current: { profile, subTab: 'partners' } }, contentReadRequest: { current: { partners: 0 } },
    partnerWriteInFlight: { current: false }, partnerReviewRequired: { current: false }, partnerReadReady: { current: true }, partners: [{ id }], editingPartnerId: null,
    partnerName: 'test', partnerDescription: '', partnerLogoUrl: form().logoUrl, partnerDisplayOrder: '0', partnerIsVisible: true, partnerFile: null, supabase: {},
    setPartnerWriteBusy: v => { state.busy = v; }, resetPartnerForm: () => { state.resets++; }, confirm: () => true, alert: v => state.alerts.push(v), handleError: async (e, code) => state.errors.push(e instanceof AppError ? e.code : code),
    saveAdminPartner: async () => { state.saves++; return options.save ? options.save() : { issue: null, stage: 'confirmed', id }; }, deleteAdminPartner: async () => { state.deletes++; },
    loadPartners: async () => { state.refresh++; if (options.refreshError) throw new AppError('ADMIN_PARTNER_REFRESH_FAILED'); },
  };
  return { state, deps, run: (mode = 'save', target = null) => compile('executePartnerWrite', deps)(mode, target) };
}
test('confirmed save resets then refreshes once', async () => { const s = screen(); await s.run(); assert.equal(s.state.saves, 1); assert.equal(s.state.resets, 1); assert.equal(s.state.refresh, 1); assert.equal(s.state.busy, false); });
test('shared lock blocks repeated save and concurrent delete', async () => {
  let finish; const s = screen({ save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); await s.run(); await s.run('delete', id); assert.equal(s.state.saves, 1); assert.equal(s.state.deletes, 0); finish({ issue: null }); await pending; assert.equal(s.deps.partnerWriteInFlight.current, false);
});
test('unknown uploaded/row result reports partial and disables repeat without clearing form', async () => {
  const s = screen({ save: () => ({ issue: new AppError('PERMISSION_DENIED'), uploadedPath: `logos/${token}.png`, stage: 'row_unconfirmed' }) }); await s.run(); await s.run(); assert.deepEqual(s.state.errors, ['ADMIN_PARTNER_SAVE_PARTIAL', 'PERMISSION_DENIED']); assert.equal(s.state.saves, 1); assert.equal(s.state.resets, 0); assert.equal(s.state.refresh, 0); assert.equal(s.deps.partnerReviewRequired.current, true);
});
test('upload uncertainty indicates DB not attempted separately from permission error', async () => {
  const s = screen({ save: () => ({ issue: new AppError('PERMISSION_DENIED'), uploadedPath: `logos/${token}.png`, stage: 'upload_unconfirmed' }) }); await s.run(); assert.deepEqual(s.state.errors, ['ADMIN_PARTNER_UPLOAD_UNCONFIRMED', 'PERMISSION_DENIED']);
});
test('cancelled delete and invalid input cannot acquire write lock', async () => {
  const s = screen(); s.deps.confirm = () => false; await s.run('delete', id); assert.equal(s.state.deletes, 0); s.deps.partnerName = ''; await s.run(); assert.equal(s.state.saves, 0); assert.equal(s.deps.partnerReviewRequired.current, false);
});
test('non-admin/read-unready/stale tab cannot write', async () => {
  for (const change of ['role', 'ready', 'tab']) { const s = screen(); if (change === 'role') s.deps.profile.role = 'director'; if (change === 'ready') s.deps.partnerReadReady.current = false; if (change === 'tab') s.deps.contentActiveView.current.subTab = 'settings'; await s.run(); assert.equal(s.state.saves, 0); }
});
test('view switch cannot reset new form/show stale alert and reloads only after release', async () => {
  let finish; const s = screen({ save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); s.deps.contentViewEpoch.current++; finish({ issue: null }); await pending;
  assert.equal(s.state.resets, 0); assert.equal(s.state.alerts.length, 0); assert.equal(s.state.refresh, 1); assert.equal(s.state.busy, false);
});
test('refresh failure remains distinct from another save', async () => { const s = screen({ refreshError: true }); await s.run(); assert.deepEqual(s.state.errors, ['ADMIN_PARTNER_REFRESH_FAILED']); assert.equal(s.state.saves, 1); assert.equal(s.deps.partnerReviewRequired.current, true); });
test('reader blocks stale reads during writes and clears review only on successful reload', async () => {
  const s = screen(); const deps = { ...s.deps, useCallback: fn => fn, setLoading() {}, setPartnerTableError() {}, setPartners() {}, loadAdminContentList: async () => [] };
  deps.partnerWriteInFlight.current = true; await compile('loadPartners', deps)(); deps.partnerWriteInFlight.current = false;
  deps.partnerReviewRequired.current = true; await compile('loadPartners', deps)(); assert.equal(deps.partnerReviewRequired.current, false);
  deps.loadAdminContentList = async () => { throw new Error('private'); }; await assert.rejects(compile('loadPartners', deps)(false), e => e.code === 'ADMIN_PARTNER_REFRESH_FAILED');
});
test('removed permissive SQL and base64 fallback; blob preview cleanup and locked controls exist', () => {
  assert.doesNotMatch(source, /Allow write for all|Storage upload failed, falling back|new FileReader/);
  assert.match(source, /URL.revokeObjectURL\(partnerPreviewUrl\)/); assert.doesNotMatch(handlers.get('executePartnerWrite'), /console\.|\.message|supabase\.from/);
});
test('partner messages match app catalog', () => {
  const app = readFileSync(new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8');
  for (const code of ['ADMIN_PARTNER_INPUT_INVALID', 'ADMIN_PARTNER_UPLOAD_UNCONFIRMED', 'ADMIN_PARTNER_SAVE_PARTIAL', 'ADMIN_PARTNER_WRITE_UNCONFIRMED', 'ADMIN_PARTNER_REFRESH_FAILED']) assert.equal(app.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
