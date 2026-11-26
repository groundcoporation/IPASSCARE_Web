import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/components/PartnerMarquee.tsx', import.meta.url), 'utf8');
function screen(reply) {
  const state = { lists: [], errors: [], requests: [] }; let effect, cleanup;
  const q = {};
  for (const method of ['select', 'eq', 'order']) q[method] = (...args) => { state.requests.push([method, ...args]); return q; };
  q.then = (yes, no) => Promise.resolve().then(() => typeof reply === 'function' ? reply() : reply).then(yes, no);
  const code = ts.transpile(source.replace(/^import .*;\r?\n/gm, '').replace('export const PartnerMarquee', 'const PartnerMarquee'), { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 });
  const View = new Function('useState', 'useEffect', 'supabase', 'normalizeError', 'handleError', code + '\nreturn PartnerMarquee;')(
    () => [[], value => state.lists.push(value)], fn => { effect = fn; },
    { from: table => { state.requests.push(['from', table]); return q; } },
    error => ({ code: 'SAFE', original: error }), async () => { state.errors.push('safe'); },
  );
  View(); cleanup = effect();
  return { state, cleanup, settle: () => new Promise(resolve => setImmediate(resolve)) };
}
test('public logo query keeps visibility/order and applies normal results', async () => {
  const rows = [{ id: 'synthetic', name: 'Test', logo_url: 'https://example.invalid/logo.png' }]; const s = screen({ data: rows, error: null }); await s.settle();
  assert.deepEqual(s.state.lists, [rows]); assert.deepEqual(s.state.requests, [['from', 'web_partner_logos'], ['select', '*'], ['eq', 'is_visible', true], ['order', 'display_order', { ascending: true }]]);
});
test('public logo response errors are no longer silently accepted with partial data', async () => {
  const s = screen({ data: [{ id: 'partial' }], error: { code: '42501', message: 'private' } }); await s.settle(); assert.deepEqual(s.state.lists, []); assert.deepEqual(s.state.errors, ['safe']);
});
test('rejected public read uses common handler and never retries', async () => {
  const s = screen(() => { throw new Error('private'); }); await s.settle(); assert.deepEqual(s.state.errors, ['safe']); assert.equal(s.state.requests.filter(c => c[0] === 'from').length, 1);
});
test('unmounted public reader cannot change list or show stale alert', async () => {
  for (const failure of [false, true]) {
    let finish, fail; const s = screen(() => new Promise((yes, no) => { finish = yes; fail = no; })); await s.settle(); s.cleanup();
    if (failure) fail(new Error('private')); else finish({ data: [{ id: 'old' }], error: null }); await s.settle(); assert.deepEqual(s.state.lists, []); assert.deepEqual(s.state.errors, []);
  }
});
test('render error boundary uses type-only imports without changing its runtime component', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'); assert.match(main, /import \{ Component, type ErrorInfo, type ReactNode \} from 'react'/); assert.match(main, /class ErrorBoundary extends Component<Props, State>/);
});
test('typecheck script checks both app and Vite/node configs, not the empty root reference config', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')); assert.equal(pkg.scripts.typecheck, 'tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.node.json --noEmit');
  assert.doesNotMatch(source, /console\.warn|catch \(err\)/);
});
