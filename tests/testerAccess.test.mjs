import assert from 'node:assert/strict';
import test from 'node:test';
import { hasTesterMarker, isTestDirector, mayOpenTestLogin, testLoginUrl } from '../src/tester/access.ts';
import { createPreviewSupabaseFetch } from '../config/preview-network.mjs';
import { assertTesterBuildTarget, TESTER_PROJECT_REF } from '../config/tester-target.mjs';

test('an enabled tester build can target only the designated Develop project', () => {
  assert.doesNotThrow(() => assertTesterBuildTarget({ environment: 'preview', projectRef: TESTER_PROJECT_REF }, true));
  for (const env of [
    { environment: 'preview', projectRef: 'abcdefghijklmnopqrst' },
    { environment: 'production', projectRef: 'wsdyrercgbvwlssntwvy' },
    { environment: 'development', projectRef: 'local' },
  ]) {
    assert.throws(() => assertTesterBuildTarget(env, true), /CONFIG_INVALID/);
    assert.doesNotThrow(() => assertTesterBuildTarget(env, false));
  }
});

test('test login is limited to a verified preview and does not accept the production host', () => {
  assert.equal(mayOpenTestLogin('preview', true, '/tester/'), true);
  assert.equal(mayOpenTestLogin('preview', false, '/tester'), false);
  assert.equal(mayOpenTestLogin('production', true, '/tester'), false);
  assert.equal(mayOpenTestLogin('preview', true, '/admin'), false);
  const prod = 'https://www.ipasscare.com';
  assert.equal(testLoginUrl('https://qa.example.com', prod), 'https://qa.example.com/tester');
  for (const url of [prod, 'https://ipasscare.com/tester', 'http://qa.example.com', 'https://qa.example.com/?redirect=foo', 'https://qa.example.com/admin', 'javascript:alert(1)'])
    assert.equal(testLoginUrl(url, prod), null);
});

test('requires administrator metadata matching the actual scoped director profile and test branch', () => {
  const branch_id = 'devsmoke-123456abcd-1';
  const user = { app_metadata: { ipasscare_tester: true, ipasscare_test_branch: branch_id } };
  assert.equal(isTestDirector({ role: 'director', branch_id }, user), true);
  assert.equal(isTestDirector({ role: 'admin', branch_id }, user), false);
  assert.equal(isTestDirector({ role: 'director', branch_id: 'devsmoke-123456abcd-2' }, user), false);
  assert.equal(isTestDirector({ role: 'director', branch_id: 'live' }, { app_metadata: { ...user.app_metadata, ipasscare_test_branch: 'live' } }), false);
  assert.equal(hasTesterMarker({ user_metadata: { ipasscare_tester: true } }), false);
});

test('Preview client allows its Auth, REST/attendance RPC and storage but not Edge or other origins', async () => {
  const base = 'https://preview.example.com';
  const calls = [];
  const request = createPreviewSupabaseFetch((url, options) => { calls.push([url, options]); return new Response(null, { status: 200 }); }, base,
    () => Response.json({ code: 'PREVIEW_EXTERNAL_DISABLED' }, { status: 403 }));
  for (const path of ['/auth/v1/token?grant_type=password', '/rest/v1/rpc/register_manual_ledger_attendance', '/rest/v1/academy_bills', '/storage/v1/object/list/test']) {
    assert.equal((await request(base + path)).status, 200);
  }
  for (const url of [base + '/functions/v1/send-academy-bills', base + '/%66unctions/v1/kspay-cancel', 'https://production.example.com/rest/v1/users']) {
    const result = await request(url);
    assert.equal(result.status, 403);
    assert.equal((await result.json()).code, 'PREVIEW_EXTERNAL_DISABLED');
  }
  assert.equal(calls.length, 4);
  assert.ok(calls.every(([, options]) => options.redirect === 'error'));
});
