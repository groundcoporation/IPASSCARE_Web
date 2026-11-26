import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { buildWithdrawalRecords, loadWithdrawalData } from '../../../src/pages/admin/students/api/withdrawalData.ts';
import { errorMessages } from '../../../src/errors/appError.ts';

const storedRecord = patch => ({
  id: 'stored', user_id: 'stored-parent', child_id: 'stored-child', branch_id: 'a',
  reason: '탈퇴', source: 'admin', refund_status: 'pending', refund_amount: 1000,
  refund_memo: '검토 기록', created_at: '2026-11-01T00:00:00.000Z', ...patch,
});
const account = patch => ({ id: 'parent', email: null, branch_id: 'a', created_at: '2026-10-01T00:00:00.000Z', ...patch });
const student = patch => ({
  id: 'student', parent_user_id: 'parent', child_id: 'child', branch_id: 'a',
  student_name: '가상 원생', parent_name: '가상 보호자', attendance_code: '1234',
  mother_phone: null, father_phone: null, student_phone: null, ...patch,
});

test('stored refund details are preserved and sorted without mutating input records', () => {
  const older = Object.freeze(storedRecord());
  const newer = Object.freeze(storedRecord({ id: 'new', refund_status: 'completed', created_at: '2026-11-02T00:00:00.000Z', refunded_at: '2026-11-03' }));
  const original = Object.freeze([older, newer]);
  const result = buildWithdrawalRecords(original, [], []);
  assert.deepEqual(result, [newer, older]);
  assert.equal(result[0], newer);
  assert.equal(result[1].refund_amount, 1000);
  assert.equal(result[1].refund_memo, '검토 기록');
  assert.deepEqual(original, [older, newer]);
});

test('legacy linked students become display-only account withdrawals with the deletion date', () => {
  const timestamp = Date.parse('2026-11-04T12:00:00.000Z');
  const result = buildWithdrawalRecords([], [account({ email: `deleted_${timestamp}@unknown.com` })], [student({ father_phone: '01000000000' })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'deleted-user:parent:child');
  assert.equal(result[0].child_name, '가상 원생');
  assert.equal(result[0].phone, '01000000000');
  assert.equal(result[0].event_type, 'account_withdrawal');
  assert.equal(result[0].source, 'app');
  assert.equal(result[0].refund_status, 'none');
  assert.equal(result[0].is_inferred, true);
  assert.equal(result[0].created_at, '2026-11-04T12:00:00.000Z');
});

test('existing account-level records suppress inferred records for that account', () => {
  const existing = storedRecord({ user_id: 'parent', child_id: null });
  assert.deepEqual(buildWithdrawalRecords([existing], [account()], [student()]), [existing]);
});

test('stored children are excluded but remaining siblings are still restored', () => {
  const result = buildWithdrawalRecords([storedRecord({ child_id: 'child' })], [account()], [student(), student({ id: 'sibling', child_id: 'child-2' })]);
  assert.equal(result.length, 2);
  assert.equal(result.filter(row => row.child_id === 'child').length, 1);
  assert.equal(result.some(row => row.id === 'deleted-user:parent:child-2'), true);
});

test('a fully covered family retains the existing account-only fallback behavior', () => {
  const result = buildWithdrawalRecords([storedRecord({ child_id: 'child' })], [account()], [student()]);
  assert.equal(result.some(row => row.id === 'deleted-user:parent' && row.child_id === null), true);
});

test('missing student links produce anonymous account rows and duplicate accounts are ignored', () => {
  const result = buildWithdrawalRecords([], [account(), account()], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'deleted-user:parent');
  assert.equal(result[0].user_name, '탈퇴한 사용자');
  assert.equal(result[0].phone, null);
  assert.equal(result[0].created_at, '2026-10-01T00:00:00.000Z');
});

test('manual students without a child ID retain stable student-based identifiers', () => {
  const result = buildWithdrawalRecords([], [account()], [student({ child_id: null, branch_id: null, parent_name: null, student_name: null, student_phone: '01000000000' })]);
  assert.equal(result[0].id, 'deleted-user:parent:student');
  assert.equal(result[0].branch_id, 'a');
  assert.equal(result[0].user_name, '탈퇴한 사용자');
  assert.equal(result[0].child_name, '원생 미지정');
  assert.equal(result[0].phone, '01000000000');
});

function fixture({ errorTable, rejectTable, empty = false } = {}) {
  const calls = [];
  const rows = {
    user_withdrawals: [storedRecord(), storedRecord({ id: 'other', branch_id: 'b' })],
    users: [account({ status: 'deleted' }), account({ id: 'active', status: 'active' }), account({ id: 'other-parent', status: 'deleted', branch_id: 'b' })],
    academy_students: [student(), student({ id: 'other-student', parent_user_id: 'other-parent', child_id: 'other-child', branch_id: 'b' })],
  };
  const client = { from(table) {
    calls.push([table, 'from']);
    const filters = [];
    const query = {
      select(columns) { calls.push([table, 'select', columns]); return query; },
      order(...args) { calls.push([table, 'order', ...args]); return query; },
      eq(column, value) { filters.push(row => row[column] === value); calls.push([table, 'eq', column, value]); return query; },
      then(resolve, reject) {
        if (table === rejectTable) return Promise.reject(new Error('private detail')).then(resolve, reject);
        return Promise.resolve({
          data: empty ? null : rows[table].filter(row => filters.every(filter => filter(row))),
          error: table === errorTable ? { code: '42501', message: 'private detail' } : null,
        }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { client, calls, rows };
}

test('branch-scoped reads combine stored and deleted-account records and exclude active users', async () => {
  const dependencies = fixture();
  const result = await loadWithdrawalData('a', dependencies);
  assert.equal(result.length, 2);
  assert.equal(result.every(row => row.branch_id === 'a'), true);
  assert.equal(result.some(row => row.user_id === 'active'), false);
  assert.equal(dependencies.calls.filter(call => call[1] === 'eq' && call[2] === 'branch_id').length, 3);
  assert.deepEqual(dependencies.calls.find(call => call[1] === 'order'), ['user_withdrawals', 'order', 'created_at', { ascending: false }]);
});

for (const branch of [null, 'all']) {
  test(`${branch} preserves all-branch reads without additional branch filters`, async () => {
    const dependencies = fixture();
    const result = await loadWithdrawalData(branch, dependencies);
    assert.equal(result.some(row => row.branch_id === 'b'), true);
    assert.equal(dependencies.calls.some(call => call[1] === 'eq' && call[2] === 'branch_id'), false);
  });
}

test('empty responses yield an empty list', async () => {
  assert.deepEqual(await loadWithdrawalData('a', fixture({ empty: true })), []);
});

for (const errorTable of ['user_withdrawals', 'users', 'academy_students']) {
  test(`${errorTable} permission errors reject the whole list without retry`, async () => {
    const dependencies = fixture({ errorTable });
    await assert.rejects(loadWithdrawalData('a', dependencies), error =>
      error.code === 'PERMISSION_DENIED' && !error.message.includes('private detail'));
    assert.equal(dependencies.calls.filter(call => call[0] === errorTable && call[1] === 'from').length, 1);
  });
}

test('transport and projection failures use the domain error without raw details', async () => {
  await assert.rejects(loadWithdrawalData('a', fixture({ rejectTable: 'users' })), error =>
    error.code === 'WITHDRAWAL_LOAD_FAILED' && !error.message.includes('private detail'));
  const dependencies = fixture();
  dependencies.rows.users[0].email = `deleted_${'9'.repeat(30)}@unknown.com`;
  await assert.rejects(loadWithdrawalData('a', dependencies), error => error.code === 'WITHDRAWAL_LOAD_FAILED');
});

const appCatalog = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('withdrawal read error message is synchronized with the app catalog', { skip: !existsSync(appCatalog) }, () => {
  const match = readFileSync(appCatalog, 'utf8').match(/WITHDRAWAL_LOAD_FAILED:\s*"([^"]+)"/);
  assert.equal(match?.[1], errorMessages.WITHDRAWAL_LOAD_FAILED);
});

const source = readFileSync(new URL('../../../src/pages/admin/students/views/AdminStudentTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudentTab.tsx', source, ts.ScriptTarget.Latest, true);
let callback;
let effect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadWithdrawals') callback = node.initializer.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0].getText(ast).includes('withdrawalLoadSequence.current')) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function screen(loader) {
  const state = { records: [], loading: false, errors: [] };
  const dependencies = {
    withdrawalLoadSequence: { current: 0 }, activeBranchId: 'a', supabase: {}, loadWithdrawalData: loader,
    setWithdrawals: value => { state.records = value; }, setWithdrawalLoading: value => { state.loading = value; },
    handleError: async (...args) => { state.errors.push(args); },
  };
  const code = ts.transpile(`const loadWithdrawals = ${callback}; const effect = ${effect};`, { target: ts.ScriptTarget.ES2022 });
  return { state, ...new Function(...Object.keys(dependencies), `${code}\nreturn { run: loadWithdrawals, mount: effect };`)(...Object.values(dependencies)) };
}

test('a late response cannot overwrite newer withdrawal records', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run(); const second = run();
  pending[1]([{ id: 'new' }]); await second;
  pending[0]([{ id: 'old' }]); await first;
  assert.deepEqual(state.records, [{ id: 'new' }]);
  assert.equal(state.loading, false);
});

test('a stale failure cannot clear newer records or show an outdated alert', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = run(); const second = run();
  pending[1].resolve([{ id: 'new' }]); await second;
  pending[0].reject(new Error('old error')); await first;
  assert.deepEqual(state.records, [{ id: 'new' }]);
  assert.deepEqual(state.errors, []);
});

test('failed reads clear stale records and release loading using the common error handler', async () => {
  const { state, run } = screen(async () => { throw new Error('failure'); });
  state.records = [{ id: 'old' }];
  await run();
  assert.deepEqual(state.records, []);
  assert.equal(state.loading, false);
  assert.equal(state.errors[0][1], 'WITHDRAWAL_LOAD_FAILED');
});
test('post-write withdrawal refresh can propagate one error to its caller', async () => {
  const failure = new Error('simulated failure');
  const { state, run } = screen(async () => { throw failure; });
  await assert.rejects(run(false), error => error === failure);
  assert.deepEqual(state.errors, []);
  assert.equal(state.loading, false);
});
test('withdrawal refresh returns fresh records only while its caller is current', async () => {
  const records = [{ id: 'fresh' }];
  const { state, run } = screen(async () => records);
  assert.equal(await run(false), records);
  state.records = [];
  assert.equal(await run(false, () => false), undefined);
  assert.deepEqual(state.records, []);
});

test('an older request cannot release the current loading indicator', async () => {
  const pending = [];
  const { state, run } = screen(() => new Promise(resolve => pending.push(resolve)));
  const first = run(); const second = run();
  pending[0]([]); await first;
  assert.equal(state.loading, true);
  pending[1]([]); await second;
  assert.equal(state.loading, false);
});

test('effect cleanup invalidates pending withdrawal results on branch change or unmount', async () => {
  let finish;
  const { state, mount } = screen(() => new Promise(resolve => { finish = resolve; }));
  const cleanup = mount(); cleanup();
  finish([{ id: 'late' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(state.records, []);
  assert.deepEqual(state.errors, []);
});
