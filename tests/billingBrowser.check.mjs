// Optional browser smoke test. Uses in-memory responses; never connects to Supabase.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IPASSCARE_BROWSER_RUNTIME || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const month = new Date().toISOString().slice(0, 7);
const fixtures = {
  students: [{ id: 'student-target', student_name: '청구대상 테스트 원생', branch_id: 'branch', child_id: null, parent_user_id: null, is_sms_enabled: false, academy_student_classes: [{ id: 'mapping-target', class_schedule_id: 'class-target', package_option_id: 'target-option', billing_cycle: '월 기간제', payment_day: '매월 1일', status: 'active', class_schedules: { target_class: '테스트 수업' }, package_options: { id: 'target-option', label: '30회', price: 45000, packages: { name: '테스트 이용권' } } }] }],
  bills: [
    { id: 'web-only', student_id: 'student-web', bill_month: month, amount_due: 45000, amount_paid: 0, billing_date: month + '-02', status: 'unpaid', payment_request_id: 'linked-request', package_option_id: 'option', academy_students: { student_name: '테스트 원생', child_id: null, parent_user_id: 'parent' }, package_options: { label: '30회', packages: { name: '체육 이용권' } } },
    { id: 'paid-only', student_id: 'student-paid', bill_month: month, amount_due: 60000, amount_paid: 60000, billing_date: month + '-03', status: 'paid', academy_students: { student_name: '완납 원생', child_id: null }, memo: '결제 완료' },
  ],
  requests: [{ id: 'app-only', status: 'pending', issued_source: 'admin_app', beneficiary_name: '앱 원생', parent_name: '테스트 보호자', request_title: '직접 청구 이용권', total_amount: 99000, final_amount: 85000, billing_month: month + '-01', created_at: month + '-04T01:00:00Z' }],
};
fixtures.students[0].academy_student_classes.push({
  ...fixtures.students[0].academy_student_classes[0], id: 'mapping-extra', class_schedule_id: 'class-extra', package_option_id: 'target-extra',
  class_schedules: { target_class: '줄바꿈을검증하기위해매우길게작성한수업반이름'.repeat(7) },
  package_options: { id: 'target-extra', label: '10회', price: 30000, packages: { name: '추가 수업 이용권' } },
});
const fake = `
  let rows = ${JSON.stringify(fixtures)};
  window.fixtureCalls = [];
  export const supabase = {
    from(table) {
      let filter = {};
      const q = {
        eq(key, value) { filter[key] = value; return proxy; },
        then(fulfill, reject) {
          const data = table === 'academy_students' ? rows.students : table === 'academy_bills' ? rows.bills :
            table === 'payment_requests' && filter.issued_source === 'admin_app' ? rows.requests : [];
          return Promise.resolve({ data, error: null }).then(fulfill, reject);
        },
      };
      const proxy = new Proxy(q, { get(target, key) { return target[key] ?? (() => proxy); } });
      return proxy;
    },
    async rpc(name, payload) {
      window.fixtureCalls.push({ name, payload });
      if (name === 'delete_unpaid_academy_bill') {
        rows.bills = rows.bills.filter((row) => row.id !== payload.p_bill_id);
        return { data: { success: true }, error: null };
      }
      if (name === 'delete_unpaid_app_payment_request') {
        rows.requests = rows.requests.filter((row) => row.id !== payload.p_request_id);
        return { data: { success: true, request_id: payload.p_request_id }, error: null };
      }
      return { data: [], error: null };
    },
  };
`;
const server = await createServer({
  root, configFile: false, server: { host: '127.0.0.1', port: 0 },
  plugins: [react(), tailwindcss(), {
    name: 'billing-browser-fixtures',
    enforce: 'pre',
    resolveId(id) { if (id === '../../lib/supabaseClient') return '\0test:supabase'; },
    load(id) { if (id === '\0test:supabase') return fake; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__billing-check') return next();
        const html = await vite.transformIndexHtml('/__billing-check', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/billingBrowserFixture.tsx"></script></body></html>');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + '/__billing-check');
  const targets = page.getByRole('region', { name: '청구 대상 목록', exact: true });
  const targetSelection = { name: /청구대상 테스트 원생 테스트 이용권 30회 청구 이용권 선택/ };
  const selectTarget = targets.getByRole('checkbox', targetSelection);
  await selectTarget.waitFor();
  await page.getByRole('button', { name: /전체 재원생/ }).waitFor();
  assert.equal(await page.getByRole('switch', { name: '매월 1일 자동 청구' }).isDisabled(), true);
  const noHorizontalScroll = async () => {
    const widths = await targets.evaluate((el) => ({ table: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth }));
    assert.ok(widths.table <= 1 && widths.page <= 1, JSON.stringify(widths));
  };
  const studentRow = targets.getByRole('row').filter({ has: page.getByRole('checkbox', targetSelection) });
  const selectAll = page.getByRole('checkbox', { name: '이번 청구 전체 선택', exact: true });
  assert.equal(await selectAll.isVisible(), true);
  assert.equal(await page.getByRole('checkbox', { name: '자동 청구 전체 선택', exact: true }).isDisabled(), true);
  await page.getByText('자동 청구는 지점을 선택한 뒤 설정할 수 있습니다.', { exact: true }).waitFor();
  assert.equal(await targets.getByText('청구대상 테스트 원생', { exact: true }).count(), 1);
  assert.equal(await studentRow.getByRole('checkbox', { name: /청구 이용권 선택/ }).count(), 2);
  await selectAll.press('Space');
  await page.getByRole('link', { name: '선택 2건 금액 확인' }).waitFor();
  assert.equal(await selectAll.isChecked(), true);
  assert.equal(await selectTarget.isChecked(), true);
  await selectAll.uncheck();
  assert.equal(await selectTarget.isChecked(), false);
  await studentRow.getByText('이용권 상세', { exact: true }).first().click();
  await studentRow.locator('details[open]').getByText('수납 일자', { exact: true }).waitFor();
  await noHorizontalScroll();
  await selectTarget.check();
  assert.equal(await selectAll.evaluate((element) => element.indeterminate), true);
  await page.getByRole('link', { name: '선택 1건 금액 확인' }).click();
  assert.equal(new URL(page.url()).hash, '#billing-amount-review');
  const issue = page.getByRole('button', { name: /월 학원비 청구/ });
  assert.equal(await issue.isEnabled(), true);
  await page.getByRole('button', { name: '10% 할인' }).click();
  await page.locator('#billing-amount-review').getByText('40,500원', { exact: true }).waitFor();
  await page.getByRole('button', { name: '기본 0%' }).click();
  await page.setViewportSize({ width: 1200, height: 900 });
  await targets.getByRole('columnheader', { name: '원생 · 자동 청구' }).waitFor();
  await noHorizontalScroll();
  assert.equal(await selectTarget.isChecked(), true);
  if (process.env.IPASSCARE_BILLING_PREVIEW_PATH) {
    await page.screenshot({ path: process.env.IPASSCARE_BILLING_PREVIEW_PATH, fullPage: true });
  }
  await page.getByRole('searchbox', { name: '청구 대상 검색' }).fill('일치하지 않는 원생');
  await page.getByText('(현재 조회 밖 1건 포함)', { exact: true }).waitFor();
  await page.getByRole('button', { name: '선택 해제', exact: true }).click();
  assert.equal(await issue.isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /청구내역 조회/ }).click();
  const web = page.getByRole('region', { name: '웹에서 발행한 청구', exact: true });
  const direct = page.getByRole('region', { name: '앱 관리자 직접 청구', exact: true });
  const mobile = web.locator('article').filter({ hasText: '테스트 원생' });
  await mobile.getByText('45,000원', { exact: true }).waitFor();
  assert.equal(await web.getByRole('table').isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await mobile.getByText('청구 상세', { exact: true }).click();
  const open = mobile.getByRole('button', { name: '청구서 삭제' });
  await open.click();
  const dialog = page.getByRole('dialog', { name: '이 청구서를 삭제할까요?' });
  await dialog.getByText('웹 발행 · 앱 전송', { exact: true }).waitFor();
  assert.match(await dialog.innerText(), /테스트 원생[\s\S]*45,000원/);
  assert.equal(await dialog.getByRole('button', { name: '돌아가기' }).evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await open.evaluate((el) => el === document.activeElement), true);
  assert.deepEqual(await page.evaluate(() => window.fixtureCalls), []);

  await page.setViewportSize({ width: 1200, height: 900 });
  const table = web.getByRole('region', { name: '웹에서 발행한 청구 표' });
  await table.waitFor();
  const row = table.getByRole('rowheader').filter({ hasText: '테스트 원생' });
  await row.waitFor();
  const pinned = await table.evaluate((element) => {
    const cell = element.querySelector('tbody th');
    const before = cell.getBoundingClientRect().left;
    element.scrollLeft = 170;
    return { offset: element.scrollLeft, shift: Math.abs(before - cell.getBoundingClientRect().left) };
  });
  assert.ok(pinned.offset > 0 && pinned.shift < 2, JSON.stringify(pinned));
  assert.equal(await table.getByRole('row').filter({ hasText: '완납 원생' }).getByRole('button', { name: '청구서 삭제' }).count(), 0);
  await table.getByRole('button', { name: '청구서 삭제' }).click();
  await dialog.getByRole('button', { name: '청구서 삭제' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('status').filter({ hasText: '미결제 청구서를 삭제했습니다.' }).waitFor();
  await direct.getByRole('button', { name: '청구서 삭제' }).click();
  await dialog.getByText('앱 원생 · 테스트 보호자', { exact: true }).waitFor();
  await dialog.getByText('85,000원', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '청구서 삭제' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual((await page.evaluate(() => window.fixtureCalls)).filter((call) => call.name.startsWith('delete_')).map(({ name, payload }) =>
    [name, payload.p_bill_id ?? payload.p_request_id]), [
    ['delete_unpaid_academy_bill', 'web-only'], ['delete_unpaid_app_payment_request', 'app-only'],
  ]);
  console.log('Billing target selection and review, mobile layout, sticky row header, dialog focus and mocked delete routing passed.');
} finally {
  await browser?.close();
  await server.close();
}
