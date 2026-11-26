import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { regressionFiles, verificationEnv, verificationSteps, executeSteps } from '../../scripts/verify-refactor.mjs';
const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

test('verification replaces inherited cloud Vite settings with public loopback settings', () => {
  const env = verificationEnv({ Path: 'keep', VITE_APP_ENV: 'production', VITE_SECRET: 'remove', vite_other: 'remove' });
  assert.equal(env.Path, 'keep');
  assert.equal(env.VITE_SECRET, undefined);
  assert.equal(env.vite_other, undefined);
  assert.equal(env.VITE_APP_ENV, 'development');
  assert.equal(env.VITE_SUPABASE_PROJECT_REF, 'local');
  assert.equal(env.VITE_SUPABASE_URL, 'http://127.0.0.1:45431');
  assert.equal(env.IPASSCARE_REQUIRE_APP_CONTRACT, '1');
});
test('regression selection is unique and rejects shell or live SQL commands', () => {
  const files = regressionFiles(scripts);
  assert.equal(new Set(files).size, files.length);
  assert.ok(files.includes('tests/admin/notices/noticeWrites.test.mjs'));
  assert.ok(files.every(file => /\.test\.(mjs|ts)$/.test(file)));
  for (const command of ['node --test tests/a.test.mjs; echo bad', 'node --test tests/live.sql', 'npm run live',
    'node --test tests/../outside.test.mjs', 'node --test tests/admin/../../outside.test.mjs',
    'node --test tests/browser/marketing/marketingBrowser.check.mjs']) {
    assert.throws(() => regressionFiles({ ...scripts, 'test:attendance': command }));
  }
});
test('full verification retains contract audit and local build; no dev server or deploy', () => {
  const steps = verificationSteps('all', scripts);
  assert.ok(steps.some(([, args]) => args.includes('tests/shared/appError.test.ts')));
  assert.deepEqual(steps.at(-1)[1], ['node_modules/vite/bin/vite.js', 'build', '--mode', 'development', '--outDir', 'dist-local']);
  assert.equal(verificationSteps('regression', scripts).length, 1);
  assert.throws(() => verificationSteps('production', scripts));
});
test('failure, signal and spawn error stop all subsequent steps and stay nonzero', () => {
  for (const result of [{ status: 2 }, { status: null, signal: 'SIGTERM' }, { error: new Error('spawn') }]) {
    let calls = 0;
    assert.ok(executeSteps([['first', []], ['must not run', []]], () => { calls++; return result; }, () => {}) > 0);
    assert.equal(calls, 1);
  }
  assert.equal(executeSteps([['ok', []]], () => ({ status: 0 }), () => {}), 0);
});
