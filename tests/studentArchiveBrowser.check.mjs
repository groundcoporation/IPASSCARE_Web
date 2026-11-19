// Optional Edge smoke test using only in-memory fixture responses.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IPASSCARE_BROWSER_RUNTIME || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const fake = `
  window.archiveCalls = [];
  window.studentSaveCalls = [];
  const student = { id: 'student-a', branch_id: 'branch-a', student_name: '퇴원 테스트 원생', attendance_code: '4444', child_id: null, parent_user_id: null, parent_name: '테스트 보호자', mother_phone: '010-0000-0000', school_name: '테스트초등학교', grade_level: '3학년', admission_date: '2026-01-20' };
  const others = Array.from({ length: 20 }, (_, i) => ({ ...student, id: 'other-' + i, student_name: '가나다 테스트 ' + String(i + 1).padStart(2, '0'), attendance_code: String(4000 + i) }));
  let archived = false;
  export const supabase = {
    from(table) {
      let rosterFilter = false;
      let updatePayload = null;
      let recordId = null;
      const q = {
        update(payload) { updatePayload = payload; return proxy; },
        eq(key, value) { if (key === 'id') recordId = value; return proxy; },
        is(key) { if (key === 'archived_at') rosterFilter = true; return proxy; },
        then(fulfill, reject) {
          if (table === 'academy_students' && recordId === student.id && updatePayload) {
            window.studentSaveCalls.push({ id: recordId, memo: updatePayload.memo });
            Object.assign(student, updatePayload);
            return Promise.resolve({ data: [], error: null }).then(fulfill, reject);
          }
          const data = table === 'academy_students' ? [...others, ...(!rosterFilter || !archived ? [student] : [])] :
            table === 'packages' ? [{ id: 'pkg-a', branch_id: student.branch_id, name: '수업 이용권', voucher_type: 'lesson', package_options: [{ id: 'opt-a', label: '월 이용권', price: 45000 }] }] :
            table === 'academy_student_classes' ? [{ student_id: student.id, class_schedule_id: null, package_option_id: 'opt-a', status: 'active' }] :
            table === 'user_withdrawals' && archived ? [{ id: 'withdrawal-a', branch_id: student.branch_id, child_name: student.student_name, reason: '수업 종료', event_type: 'academy_withdrawal', source: 'admin', created_at: new Date().toISOString(), refund_status: 'none' }] : [];
          return Promise.resolve({ data, error: null }).then(fulfill, reject);
        },
      };
      const proxy = new Proxy(q, { get(target, key) { return target[key] ?? (() => proxy); } });
      return proxy;
    },
    async rpc(name, payload) {
      if (name !== 'archive_academy_student') return { data: [], error: null };
      window.archiveCalls.push(payload);
      if (window.rejectArchive) return { data: null, error: { code: '42501' } };
      archived = true;
      return { data: { status: 'archived' }, error: null };
    },
  };
`;
const server = await createServer({
  root, configFile: false, server: { host: '127.0.0.1', port: 0 },
  plugins: [react(), tailwindcss(), {
    name: 'student-archive-fixtures',
    enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0test:students-supabase'; },
    load(id) { if (id === '\0test:students-supabase') return fake; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__archive-check') return next();
        const html = await vite.transformIndexHtml('/__archive-check', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/studentArchiveBrowserFixture.tsx"></script></body></html>');
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
  await page.goto(origin + '/__archive-check');
  const roster = page.getByRole('region', { name: '학생 목록', exact: true });
  const next = roster.getByRole('button', { name: '다음', exact: true });
  await next.waitFor();
  await roster.getByText('전체 21명 중 1–20명', { exact: true }).waitFor();
  await next.click();
  await roster.getByText('전체 21명 중 21–21명', { exact: true }).waitFor();
  const widths = () => roster.evaluate((el) => ({ roster: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth }));
  const noHorizontalOverflow = async () => {
    const result = await widths();
    assert.ok(result.roster <= 1 && result.page <= 1, JSON.stringify(result));
  };
  await noHorizontalOverflow();
  await page.getByRole('button', { name: /수업반 배정만 보기/ }).click();
  await roster.getByText('조건에 맞는 학생이 없습니다.', { exact: true }).waitFor();
  await roster.getByRole('button', { name: '검색·필터 초기화' }).click();
  await roster.getByText('전체 21명 중 1–20명', { exact: true }).waitFor();
  const search = page.getByRole('searchbox', { name: '학생 검색' });
  await search.fill('퇴원 테스트 원생');
  await roster.getByText('테스트초등학교 · 3학년', { exact: true }).waitFor();
  await roster.getByText('010-0000-0000', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await roster.getByRole('columnheader', { name: '보호자 · 연락처', exact: true }).waitFor();
  await noHorizontalOverflow();
  await page.setViewportSize({ width: 390, height: 844 });
  const open = page.getByRole('button', { name: '퇴원 테스트 원생 탈퇴 처리' });
  const dialog = page.getByRole('dialog', { name: '탈퇴 처리', exact: true });
  await open.click();
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /종료되는 항목[\s\S]*보존되는 기록/);
  assert.ok(await dialog.evaluate((el) => el.getBoundingClientRect().width <= window.innerWidth));
  assert.equal(await dialog.getByRole('button', { name: '돌아가기' }).evaluate((el) => el === document.activeElement), true);
  assert.equal(await dialog.getByRole('button', { name: '탈퇴 처리 완료' }).isDisabled(), true);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await open.evaluate((el) => el === document.activeElement), true);
  assert.deepEqual(await page.evaluate(() => window.archiveCalls), []);

  const details = page.getByRole('button', { name: '퇴원 테스트 원생 상세·수정', exact: true });
  await details.click();
  const detailHeading = page.getByRole('heading', { name: '퇴원 테스트 원생', exact: true });
  await detailHeading.waitFor();
  assert.equal(await detailHeading.evaluate((el) => el === document.activeElement), true);
  assert.equal(await roster.isVisible(), false);
  assert.equal(await page.getByRole('dialog').isVisible(), false);
  await page.getByRole('group', { name: '수업·이용권', exact: true }).waitFor();
  const detailNav = page.getByRole('navigation', { name: '학생 정보 항목' });
  await detailNav.getByRole('button', { name: '연락처·추가 정보' }).click();
  const contactLegend = page.getByRole('group', { name: '연락처·추가 정보', exact: true }).locator('legend');
  assert.equal(await contactLegend.evaluate((el) => el === document.activeElement), true);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  if (process.env.IPASSCARE_STUDENT_PREVIEW_PATH) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await detailHeading.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: process.env.IPASSCARE_STUDENT_PREVIEW_PATH, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  const editorOpen = page.getByRole('button', { name: '탈퇴 처리', exact: true });
  await editorOpen.click();
  await dialog.getByText('학생 상세 화면에서 저장하지 않은 변경은 함께 저장되지 않습니다.', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: '돌아가기' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await editorOpen.evaluate((el) => el === document.activeElement), true);
  const memo = page.getByRole('textbox', { name: '비공개 학생 메모', exact: true });
  await memo.fill('저장하지 않을 메모');
  await page.getByRole('status').filter({ hasText: '저장하지 않은 변경사항이 있습니다.' }).waitFor();
  const back = page.getByRole('button', { name: '학생 목록으로', exact: true });
  page.once('dialog', (prompt) => prompt.dismiss());
  await back.click();
  assert.equal(await detailHeading.isVisible(), true);
  page.once('dialog', (prompt) => prompt.accept());
  await back.click();
  await roster.waitFor();
  assert.equal(await details.evaluate((el) => el === document.activeElement), true);
  assert.equal(await search.inputValue(), '퇴원 테스트 원생');
  assert.deepEqual(await page.evaluate(() => window.studentSaveCalls), []);
  await details.click();
  await memo.waitFor();
  assert.equal(await memo.inputValue(), '');
  await memo.fill('저장한 메모');
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await details.waitFor();
  await page.getByRole('status').filter({ hasText: '학생 정보를 저장했습니다.' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.studentSaveCalls), [{ id: 'student-a', memo: '저장한 메모' }]);

  await open.click();
  await dialog.getByRole('textbox', { name: '탈퇴 사유' }).fill('수업 종료');
  await dialog.getByRole('textbox', { name: /대상 확인/ }).fill('다른 이름');
  const submit = dialog.getByRole('button', { name: '탈퇴 처리 완료' });
  assert.equal(await submit.isDisabled(), true);
  await dialog.getByRole('textbox', { name: /대상 확인/ }).fill('퇴원 테스트 원생');
  await page.evaluate(() => { window.rejectArchive = true; });
  const warning = page.waitForEvent('dialog').then(async (alert) => {
    assert.match(alert.message(), /PERMISSION_DENIED/);
    await alert.accept();
  });
  await submit.click();
  await warning;
  await submit.waitFor();
  assert.equal(await dialog.isVisible(), true);
  await page.evaluate(() => { window.rejectArchive = false; });
  await submit.click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('status').filter({ hasText: '탈퇴 처리했습니다. 기존 청구와 일지는 보존됩니다.' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.archiveCalls), Array.from({ length: 2 }, () => ({ p_student_id: 'student-a', p_child_id: null, p_reason: '수업 종료' })));
  await page.getByRole('button', { name: '탈퇴 이력 보기' }).click();
  await page.getByText('퇴원 테스트 원생', { exact: true }).waitFor();
  console.log('Student roster, detail navigation, discard, save, and archive workflows passed.');
} finally {
  await browser?.close();
  await server.close();
}
