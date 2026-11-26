import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suites = ['attendance', 'excel', 'billing', 'journals', 'students',
  'payment-cancel', 'payment-history', 'schedule', 'admin-content', 'admin-settings',
  'admin-videos', 'admin-partners', 'type-cleanup', 'hook-dependencies', 'notices',
  'notice-writes', 'dashboard', 'class-management', 'referrals', 'shuttle-map', 'class-writes'];

export function regressionFiles(scripts) {
  const files = new Set(['tests/architecture/refactorVerification.test.mjs']);
  for (const suite of suites) {
    const command = scripts[`test:${suite}`];
    if (typeof command !== 'string' || !/^node --test(?: tests\/(?:[\w-]+\/)*[\w.-]+\.test\.(?:mjs|ts))+$/.test(command)) {
      throw new Error(`Invalid regression script: test:${suite}`);
    }
    for (const file of command.slice('node --test '.length).split(' ')) files.add(file);
  }
  return [...files].sort();
}

export function verificationEnv(source) {
  return {
    ...Object.fromEntries(Object.entries(source).filter(([key]) => !/^VITE_/i.test(key))),
    VITE_APP_ENV: 'development', VITE_SUPABASE_PROJECT_REF: 'local',
    VITE_SUPABASE_URL: 'http://127.0.0.1:45431',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_example_public_test_key',
    IPASSCARE_REQUIRE_APP_CONTRACT: '1',
  };
}

export function verificationSteps(mode, scripts) {
  const regression = ['regression', ['--test', ...regressionFiles(scripts)]];
  if (mode === 'regression') return [regression];
  if (mode !== 'all') throw new Error('Use all or regression');
  return [
    ['typecheck:app', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.app.json', '--noEmit']],
    ['typecheck:node', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.node.json', '--noEmit']],
    ['lint', ['node_modules/oxlint/bin/oxlint']],
    regression,
    ['contracts/environment/marketing', ['--test', 'tests/shared/appError.test.ts',
      'tests/environment/environment.test.mjs', 'tests/environment/browserEnvironment.test.mjs', 'tests/marketing/marketingContent.test.mjs']],
    ['local build (not deployable)', ['node_modules/vite/bin/vite.js', 'build', '--mode', 'development', '--outDir', 'dist-local']],
  ];
}

export function executeSteps(steps, run, report = console.log) {
  for (const [name, args] of steps) {
    report(`\n[verify] ${name}`);
    const result = run(args);
    if (result.error || result.signal || result.status !== 0) {
      report(`[verify] FAILED: ${name}; remaining steps not executed`);
      return Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { scripts } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const steps = verificationSteps(process.argv[2] ?? 'all', scripts);
  process.exitCode = executeSteps(steps, args => spawnSync(process.execPath, args, {
    cwd: root, env: verificationEnv(process.env), stdio: 'inherit', shell: false,
  }));
}
