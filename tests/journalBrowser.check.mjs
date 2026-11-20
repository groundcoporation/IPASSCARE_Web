// Browser smoke test with in-memory responses only. No Supabase requests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IPASSCARE_BROWSER_RUNTIME || 'playwright');
const fake = `
  window.saves = [];
  window.notifications = [];
  const shared = { branch_id: 'branch-a', student_id: 'student-a', created_at: '2026-11-16T00:00:00Z', is_parent_visible: false };
  const data = {
    academy_students: [
      { id: 'student-a', branch_id: 'branch-a', student_name: '테스트 원생', attendance_code: '1234', parent_name: '테스트 보호자', academy_student_classes: [{ class_schedules: { id: 'class-a', target_class: '수학반' } }] },
      { id: 'student-b', branch_id: 'branch-a', student_name: '두번째 원생', attendance_code: '5678' },
    ],
    academy_teachers: [],
    academy_counsel_logs: [{ ...shared, id: 'counsel-a', counsel_date: '2026-11-16', category: '일반상담', counselor_name: '테스트 선생님', content: '이전 상담 기록' }],
    academy_study_logs: [{ ...shared, id: 'study-a', lesson_date: '2026-11-16', title: '이전 학습 기록', class_name: '수학반', teacher_name: '테스트 선생님', content: '복습할 범위' }],
  };
  export const supabase = {
    from(table) {
      let payload = null, isSingle = false;
      const query = {
        insert(rows) { payload = rows[0]; return proxy; },
        single() { isSingle = true; return proxy; },
        then(fulfill, reject) {
          if (isSingle && payload) {
            window.saves.push({ table, student: payload.student_id, visible: payload.is_parent_visible });
            return Promise.resolve({ data: { ...shared, ...payload, id: 'saved' }, error: null }).then(fulfill, reject);
          }
          return Promise.resolve({ data: data[table] || [], error: null }).then(fulfill, reject);
        },
      };
      const proxy = new Proxy(query, { get(target, key) { return target[key] ?? (() => proxy); } });
      return proxy;
    },
    async rpc(name,args) {
      window.notifications.push({name,...args.p_payload});
      return {data:{success:true,testMode:true,externalDelivery:false,targetCount:1},error:null};
    },
    functions: {async invoke(){throw new Error('Preview must not invoke Edge delivery');}},
  };
`;

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
  define:{__IPASSCARE_ENVIRONMENT__:JSON.stringify({environment:'preview',databaseTarget:'cloud',projectRef:'msvwhvonafmeycmcvarv'})},
  server: { host: '127.0.0.1', port: 0 },
  plugins: [react(), tailwindcss(), {
    name: 'journal-fixture',
    enforce: 'pre',
    resolveId(id) { if (id.endsWith('/supabaseClient')) return '\0test:journal-db'; },
    load(id) { if (id === '\0test:journal-db') return fake; },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/__journal-check') return next();
        const html = await vite.transformIndexHtml('/__journal-check', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/journalBrowserFixture.tsx"></script></body></html>');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
  }],
});

let browser;
try {
  await server.listen();
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
  const page = await browser.newPage();
  await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  for (const counsel of [false, true]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/__journal-check' + (counsel ? '?counsel' : ''));
    await page.getByRole('heading', { name: '테스트 원생', exact: true }).waitFor();
    const noHorizontalOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    assert.ok(await noHorizontalOverflow());
    await page.getByRole('searchbox', { name: '원생 검색' }).fill('없는 학생');
    await page.getByText('조건에 맞는 원생이 없습니다.', { exact: true }).waitFor();
    await page.getByRole('button', { name: '검색·필터 초기화' }).click();
    await page.getByRole('button', { name: '이력 바로 보기' }).click();
    const history = page.getByRole('heading', { name: counsel ? /상담 이력/ : /학습 이력/ });
    assert.equal(await history.evaluate((el) => el === document.activeElement), true);
    await page.getByRole('button', { name: /수정$/ }).click();
    assert.equal(await page.getByRole('heading', { name: counsel ? '상담일지 수정' : '학습일지 수정' }).evaluate((el) => el === document.activeElement), true);
    await page.getByRole('button', { name: '수정 취소' }).click();
    const visibility = page.getByRole('checkbox', { name: '학부모 앱에 공개하고 알림 보내기' });
    assert.equal(await visibility.isChecked(), false);
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.ok(await noHorizontalOverflow());
    if (!counsel) await page.getByRole('textbox', { name: '일지 제목 *', exact: true }).fill('새 학습 기록');
    await page.getByRole('textbox', { name: counsel ? '상담 내용 *' : '학습 내용 및 수업 진도 *', exact: true }).fill('테스트 저장 내용');
    if (counsel) await visibility.check();
    let notificationMessage='';
    page.once('dialog', (alert) => {notificationMessage=alert.message();return alert.accept();});
    await page.getByRole('button', { name: counsel ? '저장하고 알림 보내기' : /내부용으로 저장/, exact: true }).click();
    await page.getByText('테스트 저장 내용', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.saves), [{ table: counsel ? 'academy_counsel_logs' : 'academy_study_logs', student: 'student-a', visible: counsel }]);
    assert.deepEqual(await page.evaluate(() => window.notifications), counsel ? [{ name: 'simulate_tester_activity_notification', journalType: 'counsel', journalId: 'saved' }] : []);
    if(counsel)assert.match(notificationMessage,/실제 알림은 발송하지 않았습니다/);
  }
  console.log('Study and counsel UI, responsive layout, and private/public save flows passed.');
} finally {
  await browser?.close();
  await server.close();
}
