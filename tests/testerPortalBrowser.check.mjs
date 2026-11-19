// Uses real AdminPage with mocked HTTP. No requests reach a hosted Supabase project.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IPASSCARE_BROWSER_RUNTIME || 'playwright');
process.env.VITE_TESTER_ISOLATION_VERIFIED = 'true';
const vite = await createServer({ mode: 'preview', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const branchId = 'devsmoke-123456abcd-1';
  const profile = { id: '00000000-0000-4000-8000-000000000001', role: 'director', name: '테스트 원장', branch_id: branchId };
  const branch = { id: branchId, name: '가상 지점' };
  let matching = false;
  const remoteRequests = [];
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    remoteRequests.push(url.pathname);
    const user = { id: profile.id, aud: 'authenticated', app_metadata: {
      ipasscare_tester: true, ipasscare_test_branch: matching ? branchId : 'devsmoke-123456abcd-2',
    } };
    if (url.pathname === '/auth/v1/token') {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ exp })).toString('base64url'), 'fixture'].join('.');
      return route.fulfill({ json: { user, access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer' } });
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if (url.pathname === '/rest/v1/users' && url.searchParams.get('id') === 'eq.' + profile.id) return route.fulfill({ json: profile });
    if (url.pathname === '/rest/v1/branches') return route.fulfill({ json: [branch] });
    return route.fulfill({ json: [] });
  });
  await page.goto(origin + '/tester');
  const login = async () => {
    await page.getByLabel('테스트 계정 이메일').fill('mock@example.com');
    await page.getByLabel('PASSWORD', { exact: true }).fill('test-password');
    await page.getByRole('button', { name: '테스트 계정으로 로그인' }).click();
  };
  await login();
  await page.getByText(/\[PERMISSION_DENIED\]/).waitFor();
  matching = true;
  await login();
  await page.getByText('테스트 · 가상 지점', { exact: true }).waitFor();
  await page.getByRole('button', { name: '출결관리', exact: true }).click();
  await page.getByRole('button', { name: '출결 조회 (원생 장부)', exact: true }).click();
  await page.getByRole('heading', { name: '월별 출결 장부', exact: true }).waitFor();
  await page.getByRole('button', { name: '수납관리', exact: true }).click();
  await page.getByRole('button', { name: /청구대상 관리/ }).waitFor();
  assert.equal(remoteRequests.some((path) => path.startsWith('/functions/')), false);
  console.log('Tester Preview uses the real admin attendance/billing screens and rejects mismatched branch profiles.');
} finally {
  await browser?.close();
  await vite.close();
}
