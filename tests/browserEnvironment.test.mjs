import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createLocalFetchGuard } from '../config/local-network.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('production and local start commands remain explicit and separate', () => {
  const scripts = JSON.parse(read('../package.json')).scripts;
  assert.equal(scripts.dev, 'vite --mode production');
  assert.equal(scripts['dev:local'], 'vite --mode development');
  assert.equal(scripts['dev:production'], 'vite --mode production');
});

test('browser environment uses the Vite-validated public configuration', () => {
  const source = read('../src/lib/environment.ts');
  assert.match(source, /import type/);
  assert.doesNotMatch(source, /import\s*\{\s*resolveEnvironment/);
  assert.match(source, /Object\.freeze\(__IPASSCARE_ENVIRONMENT__\)/);
  assert.match(read('../vite.config.ts'), /__IPASSCARE_ENVIRONMENT__: JSON\.stringify\(environment\)/);
  assert.match(read('../src/lib/localNetwork.ts'), /local-network\.mjs/);
});

test('local request guard allows only selected loopback origins and rejects redirects', async () => {
  const calls = [];
  const failure = () => new Error('[LOCAL_EXTERNAL_DISABLED]');
  const guarded = createLocalFetchGuard(async (...args) => { calls.push(args); return new Response('ok'); },
    ['http://127.0.0.1:5173', 'http://127.0.0.1:45431'], failure);
  await guarded('http://127.0.0.1:45431/rest/v1/test');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].redirect, 'error');
  for (const url of ['https://example.com', 'http://127.0.0.1:55431', 'http://name:password@127.0.0.1:45431']) {
    await assert.rejects(guarded(url), /LOCAL_EXTERNAL_DISABLED/);
  }
  assert.equal(calls.length, 1);
});
