// Optional browser smoke test. Starts a temporary localhost-only Vite preview.
// All external requests are intercepted; production APIs are never contacted.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IPASSCARE_BROWSER_RUNTIME || 'playwright');
const origin = 'http://127.0.0.1:4175';
const output = mkdtempSync(join(tmpdir(), 'ipasscare-marketing-'));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = title => ({ id: title, category: 'parent', title, description: '기능 안내', steps: ['앱에서 확인'], is_visible: true });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin === origin) return route.continue();
  if (url.pathname === '/rest/v1/web_manual_videos') {
    return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify([
      fixture('승하차 알림 확인 가이드'), fixture('제휴 쇼핑몰 이용 가이드'),
    ]) });
  }
  return route.abort();
});
const server = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
  'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort',
], { cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local preview did not start')), 10000);
    server.on('error', () => { clearTimeout(timer); reject(new Error('Local preview could not start')); });
    server.stdout.on('data', data => {
      if (data.toString().includes('Local:')) { clearTimeout(timer); resolve(); }
    });
    server.on('exit', code => { if (code) { clearTimeout(timer); reject(new Error('Local preview exited')); } });
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', () => runtimeErrors.push('pageerror'));
  await page.goto(origin);
  const phone = page.locator('[aria-label="아이패스케어 앱 화면 예시"]');
  await phone.getByRole('button', { name: '학습·상담일지 화면 보기', exact: true }).waitFor();
  const hero = page.locator('main > section').first();
  assert.doesNotMatch(await hero.innerText(), /30명|프라임|월 3만원|쇼핑몰|자사몰/);
  assert.doesNotMatch(await page.locator('body').innerText(), /쇼핑몰|VOG SPORTS|118,000|프라임|30명까지 무료/);
  await phone.screenshot({ path: join(output, 'phone-home.png') });
  await phone.getByRole('button', { name: '학습·상담일지 화면 보기', exact: true }).click();
  assert.equal(await phone.locator('article').count(), 2);
  await phone.getByRole('button', { name: '상담일지', exact: true }).click();
  assert.equal(await phone.locator('article').count(), 1);
  assert.match(await phone.locator('article').innerText(), /학원 생활 상담/);
  assert.doesNotMatch(await phone.locator('article').innerText(), /오늘의 학습 기록/);
  await phone.getByRole('button', { name: '학습일지', exact: true }).click();
  assert.equal(await phone.locator('article').count(), 1);
  assert.match(await phone.locator('article').innerText(), /오늘의 학습 기록/);
  await phone.getByRole('button', { name: '전체', exact: true }).click();
  await phone.screenshot({ path: join(output, 'phone-journal.png') });
  await phone.getByRole('button', { name: '학습·상담일지', exact: true }).click();
  await phone.getByRole('button', { name: '학습·상담일지 화면 보기', exact: true }).waitFor();

  const pricing = page.locator('#calculator');
  assert.equal(await pricing.locator('article').count(), 4);
  for (const text of ['Lite (베이직)', 'Lite (라이트)', 'Pro (프로)', 'Enterprise (엔터프라이즈)', '39,900원', '69,900원', '99,000원', '119,900원', 'VAT 별도', 'VAT 포함']) assert.ok((await pricing.innerText()).includes(text), text);
  await pricing.screenshot({ path: join(output, 'pricing-desktop.png') });
  await page.getByText('승하차 알림 확인 가이드', { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(), /쇼핑몰|VOG SPORTS/);
  await pricing.getByRole('button', { name: 'Lite (베이직) 선택', exact: true }).click();
  assert.match(await pricing.getByTestId('monthly-net-value').innerText(), /514,110원/);
  await pricing.getByRole('button', { name: 'Lite (라이트) 선택', exact: true }).click();
  assert.match(await pricing.getByTestId('monthly-net-value').innerText(), /481,110원/);
  await pricing.getByRole('slider', { name: '현재 재원생 수', exact: true }).press('Home');
  await pricing.getByTestId('monthly-net-value').waitFor();
  await pricing.getByRole('slider', { name: '운행 셔틀버스 대수', exact: true }).press('Home');
  await pricing.getByRole('button', { name: 'Enterprise (엔터프라이즈) 선택', exact: true }).click();
  assert.match(await pricing.getByTestId('monthly-net-value').innerText(), /-126,490원/);
  await pricing.getByText('산출 기준 확인·변경', { exact: true }).click();
  await pricing.getByRole('spinbutton', { name: '미납 회수 가정 비율(%)', exact: true }).fill('5');
  assert.match(await pricing.getByTestId('monthly-net-value').innerText(), /-117,490원/);
  await pricing.getByRole('button', { name: '도입 상담 신청', exact: true }).click();
  await page.waitForFunction(() => Math.abs(document.querySelector('#inquiry').getBoundingClientRect().top) < 150);

  await page.setViewportSize({ width: 390, height: 844 });
  await phone.scrollIntoViewIfNeeded();
  await phone.getByRole('button', { name: '학습·상담일지 화면 보기', exact: true }).click();
  await phone.getByRole('button', { name: '상담일지', exact: true }).click();
  assert.equal(await phone.locator('article').count(), 1);
  await phone.screenshot({ path: join(output, 'phone-mobile.png') });
  await pricing.scrollIntoViewIfNeeded();
  assert.equal(await pricing.locator('article').count(), 4);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile page must not overflow horizontally');
  await pricing.screenshot({ path: join(output, 'pricing-mobile.png') });
  assert.deepEqual(runtimeErrors, []);
  console.log('PASS: desktop/mobile pricing, journal navigation/filters, back navigation, inquiry CTA, retired DB guides, no runtime errors.');
  console.log(`Screenshots: ${output}`);
} finally {
  await context.close();
  await browser.close();
  server.kill();
}
