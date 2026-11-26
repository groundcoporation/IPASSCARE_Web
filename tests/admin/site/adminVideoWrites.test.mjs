import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { saveAdminVideo, deleteAdminVideo } from '../../../src/pages/admin/site/api/videoWrites.ts';
import { extractYoutubeId, prepareVideo, videoSteps, videoDuration, isVideoId } from '../../../src/pages/admin/site/model/videos.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';
const id = '11111111-1111-4111-8111-111111111111';
const form = patch => ({ title: ' test ', category: 'parent', duration: '', description: ' desc ', stepsText: '1. First\n2) Second\n\n', url: 'https://youtu.be/abcdefghijk', theme: 'from-blue-600 to-indigo-700', restricted: false, ...patch });
function mock(reply) {
  const calls = []; const q = {}; let values;
  for (const method of ['insert', 'update', 'delete', 'eq', 'select', 'single']) q[method] = (...args) => { calls.push([method, ...args]); if (method === 'update') values = args[0]; if (method === 'insert') values = args[0][0]; return q; };
  q.then = (yes, no) => Promise.resolve().then(() => { if (reply instanceof Error) throw reply; return reply ?? { data: { ...values, id }, error: null }; }).then(yes, no);
  return { calls, client: { from: table => { calls.push(['from', table]); return q; } } };
}
test('form preparation preserves step cleanup, labels, visibility and access flags', () => {
  const value = prepareVideo(form()); assert.equal(value.title, 'test'); assert.deepEqual(value.steps, ['First', 'Second']); assert.equal(value.youtube_id, 'abcdefghijk'); assert.equal(value.duration, '유튜브 자동 감지됨'); assert.equal(value.category_label, '학부모 매뉴얼'); assert.equal(value.access_level, 'public'); assert.equal(value.is_visible, true);
  assert.equal(prepareVideo(form({ restricted: true, category: 'driver' })).access_level, 'staff'); assert.equal(videoDuration(' 3분 ', null), '3분'); assert.equal(videoDuration('', null), '2분 분량'); assert.deepEqual(videoSteps('a\n\n b'), ['a', 'b']);
});
test('existing YouTube extraction behavior retained for common formats and non-matching URLs', () => {
  for (const path of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/embed/abcdefghijk', 'https://www.youtube.com/shorts/abcdefghijk']) assert.equal(extractYoutubeId(path), 'abcdefghijk');
  assert.equal(extractYoutubeId('https://example.invalid/'), null); assert.equal(prepareVideo(form({ url: 'https://example.invalid/' })).youtube_id, null);
  assert.equal(prepareVideo(form({ url: ' https://youtu.be/abcdefghijk ' })).youtube_id, null);
});
test('insert retains display_order zero and returns confirmed UUID only', async () => {
  const d = mock(); assert.deepEqual(await saveAdminVideo(form(), null, d), { id }); assert.equal(d.calls.find(c => c[0] === 'insert')[1][0].display_order, 0); assert.equal(d.calls.filter(c => c[0] === 'insert').length, 1);
});
test('update scopes to original UUID and does not overwrite display order', async () => {
  const d = mock(); await saveAdminVideo(form(), id, d); assert.deepEqual(d.calls.find(c => c[0] === 'eq'), ['eq', 'id', id]); assert.equal('display_order' in d.calls.find(c => c[0] === 'update')[1], false);
});
test('delete scopes to UUID and confirms returned deleted row', async () => {
  const d = mock({ data: { id }, error: null }); await deleteAdminVideo(id, d); assert.deepEqual(d.calls, [['from', 'web_manual_videos'], ['delete'], ['eq', 'id', id], ['select', 'id'], ['single']]);
});
test('invalid form or ID cannot start a write', async () => {
  for (const patch of [{ title: '' }, { title: 'x'.repeat(151) }, { url: '' }, { category: 'constructor' }]) { const d = mock(); await assert.rejects(saveAdminVideo(form(patch), null, d), e => e.code === 'ADMIN_VIDEO_INPUT_INVALID'); assert.equal(d.calls.length, 0); }
  for (const action of [d => saveAdminVideo(form(), 'bad', d), d => deleteAdminVideo('bad', d)]) { const d = mock(); await assert.rejects(action(d), e => e.code === 'ADMIN_VIDEO_INPUT_INVALID'); assert.equal(d.calls.length, 0); }
});
test('unknown/mismatched save acknowledgements cannot claim completion or retry', async () => {
  for (const reply of [{ data: null }, { data: { id } }, { data: { ...prepareVideo(form()), id: 'bad' } }, { data: { ...prepareVideo(form()), id, steps: ['changed'] } }, new Error('private')]) {
    const d = mock(reply); await assert.rejects(saveAdminVideo(form(), null, d), e => e.code === 'ADMIN_VIDEO_WRITE_UNCONFIRMED'); assert.equal(d.calls.filter(c => c[0] === 'insert').length, 1);
  }
});
test('wrong update UUID and absent deleted row are not treated as zero-row success', async () => {
  const d = mock({ data: { ...prepareVideo(form()), id: '22222222-2222-4222-8222-222222222222' } }); await assert.rejects(saveAdminVideo(form(), id, d), e => e.code === 'ADMIN_VIDEO_WRITE_UNCONFIRMED');
  for (const data of [null, {}, { id: 'wrong' }]) await assert.rejects(deleteAdminVideo(id, mock({ data })), e => e.code === 'ADMIN_VIDEO_WRITE_UNCONFIRMED');
});
test('permission/server errors are safe with no alternate write', async () => {
  for (const code of ['42501', 'PGRST202']) { const d = mock({ error: { code, message: 'private token' } }); await assert.rejects(deleteAdminVideo(id, d), e => e.code === (code === '42501' ? 'PERMISSION_DENIED' : 'SERVER_UPDATE_REQUIRED') && !e.message.includes('private')); assert.equal(d.calls.filter(c => c[0] === 'delete').length, 1); }
});
const source = readFileSync(new URL('../../../src/pages/admin/AdminPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminPage.tsx', source, ts.ScriptTarget.Latest, true); const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) { return new Function(...Object.keys(deps), ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 }) + '\nreturn handler;')(...Object.values(deps)); }
function screen(options = {}) {
  const state = { writes: 0, deletes: 0, busy: false, errors: [], resets: 0, reloads: 0, alerts: [] }; const profile = { role: 'admin' };
  const deps = { AppError, prepareVideo, isVideoId, profile, loading: false, contentViewEpoch: { current: 0 }, contentActiveView: { current: { profile, subTab: 'videos' } }, contentReadRequest: { current: { videos: 0 } },
    videoWriteInFlight: { current: false }, videoReviewRequired: { current: false }, videoReadReady: { current: true }, editingVideoId: null, videos: [{ id }],
    newVideoTitle: 'test', newVideoCategory: 'parent', newVideoDuration: '', newVideoDescription: '', newVideoStepsText: '', newVideoUrl: 'https://youtu.be/abcdefghijk', newVideoTheme: 'theme', newVideoIsRestricted: false,
    setVideoWriteBusy: v => { state.busy = v; }, resetVideoForm: () => { state.resets++; }, alert: v => state.alerts.push(v), confirm: () => true, supabase: {},
    saveAdminVideo: async () => { state.writes++; return options.save ? options.save() : { id }; }, deleteAdminVideo: async () => { state.deletes++; return options.remove?.(); },
    loadVideos: async flag => { state.reloads++; if (options.refreshError) throw new AppError('ADMIN_VIDEO_REFRESH_FAILED'); }, handleError: async (e, fallback) => state.errors.push(e instanceof AppError ? e.code : fallback),
  };
  return { state, deps, run: (mode = 'save', target = null) => compile('executeVideoWrite', deps)(mode, target) };
}
test('successful save/reset/refresh occurs after confirmed server response', async () => {
  const s = screen(); await s.run(); assert.equal(s.state.writes, 1); assert.equal(s.state.resets, 1); assert.equal(s.state.reloads, 1); assert.equal(s.state.alerts.length, 1); assert.equal(s.state.busy, false);
});
test('shared synchronous lock blocks save/delete overlap and repeated clicks', async () => {
  let finish; const s = screen({ save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); await s.run(); await s.run('delete', id); assert.equal(s.state.writes, 1); assert.equal(s.state.deletes, 0); finish({ id }); await pending; assert.equal(s.deps.videoWriteInFlight.current, false);
});
test('delete confirmation cancellation and nonexistent target do not write', async () => {
  const s = screen(); s.deps.confirm = () => false; await s.run('delete', id); assert.equal(s.state.deletes, 0);
  s.deps.confirm = () => true; s.deps.videos = []; await s.run('delete', id); assert.deepEqual(s.state.errors, ['ADMIN_VIDEO_INPUT_INVALID']);
});
test('unknown write never resets form or retries before explicit fresh read', async () => {
  const s = screen({ save: () => { throw new Error('private'); } }); await s.run(); await s.run(); assert.equal(s.state.writes, 1); assert.equal(s.state.resets, 0); assert.equal(s.state.reloads, 0); assert.equal(s.deps.videoReviewRequired.current, true); assert.equal(s.deps.videoReadReady.current, false); assert.equal(s.state.alerts.length, 0);
});
test('post-write refresh failure is reported separately without a second write', async () => {
  const s = screen({ refreshError: true }); await s.run(); assert.deepEqual(s.state.errors, ['ADMIN_VIDEO_REFRESH_FAILED']); assert.equal(s.state.writes, 1); assert.equal(s.deps.videoReviewRequired.current, true);
});
test('invalid form remains editable with no write lock acquisition', async () => {
  const s = screen(); s.deps.newVideoTitle = ''; await s.run(); assert.equal(s.state.writes, 0); assert.equal(s.deps.videoReviewRequired.current, false); assert.deepEqual(s.state.errors, ['ADMIN_VIDEO_INPUT_INVALID']);
});
test('non-admin, unready read and prior tab/profile callbacks cannot write', async () => {
  const denied = screen(); denied.deps.profile.role = 'director'; await denied.run(); assert.equal(denied.state.writes, 0); assert.deepEqual(denied.state.errors, ['PERMISSION_DENIED']);
  for (const change of ['unready', 'tab', 'profile']) { const s = screen(); if (change === 'unready') s.deps.videoReadReady.current = false; if (change === 'tab') s.deps.contentActiveView.current.subTab = 'settings'; if (change === 'profile') s.deps.contentActiveView.current.profile = {}; await s.run(); assert.equal(s.state.writes, 0); }
});
test('tab transition suppresses stale save reset/alert and requests fresh active read afterward', async () => {
  let finish; const s = screen({ save: () => new Promise(yes => { finish = yes; }) }); const pending = s.run(); s.deps.contentViewEpoch.current++; finish({ id }); await pending;
  assert.equal(s.state.resets, 0); assert.equal(s.state.alerts.length, 0); assert.equal(s.state.reloads, 1); assert.equal(s.state.busy, false);
});
test('video reader distinguishes refresh failure and resets review block only on successful read', async () => {
  const s = screen(); const deps = { ...s.deps, useCallback: fn => fn, setLoading() {}, setVideos() {}, loadAdminContentList: async () => { throw new Error('private'); } };
  await assert.rejects(compile('loadVideos', deps)(false), e => e.code === 'ADMIN_VIDEO_REFRESH_FAILED');
  deps.loadAdminContentList = async () => []; deps.videoReviewRequired.current = true; await compile('loadVideos', deps)(); assert.equal(deps.videoReviewRequired.current, false); assert.equal(deps.videoReadReady.current, true);
  deps.videoWriteInFlight.current = true; deps.loadAdminContentList = async () => { throw new Error('must not read during write'); }; await compile('loadVideos', deps)();
});
test('write service/handlers contain no raw logging or inline table fallback and controls lock', () => {
  assert.doesNotMatch(handlers.get('executeVideoWrite'), /console\.|\.message|supabase\.from/);
  assert.match(source, /<fieldset disabled=\{videoWriteBusy \|\| videoReviewRequired.current \|\| !videoReadReady.current\}/);
});
test('video write error messages match app', () => {
  const app = readFileSync(new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url), 'utf8');
  for (const code of ['ADMIN_VIDEO_INPUT_INVALID', 'ADMIN_VIDEO_WRITE_UNCONFIRMED', 'ADMIN_VIDEO_REFRESH_FAILED']) assert.equal(app.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
