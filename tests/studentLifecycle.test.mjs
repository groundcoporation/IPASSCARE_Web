import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { archiveStudentRecord, saveRefundRecord } from '../src/pages/admin/students/api/studentLifecycle.ts';
import { AppError, errorMessages } from '../src/errors/appError.ts';

for (const id of ['student', 'child-child']) {
  for (const status of ['archived', 'already_archived']) {
    test(`archive ${id} accepts ${status} with the existing RPC contract`, async () => {
      const calls = [];
      await archiveStudentRecord(id, '수강 종료', { client: { rpc: async (...args) => { calls.push(args); return { data: { status }, error: null }; } } });
      assert.deepEqual(calls, [['archive_academy_student', { p_student_id: id === 'student' ? id : null, p_child_id: id === 'student' ? null : 'child', p_reason: '수강 종료' }]]);
    });
  }
}
for (const [error, code] of [[{ code: '42501' }, 'PERMISSION_DENIED'], [{ code: 'PGRST202' }, 'SERVER_UPDATE_REQUIRED'], [{ code: 'P0001', message: '[CONFLICT_ERROR]' }, 'CONFLICT_ERROR']]) {
  test(`archive ${code} never retries or falls back to physical deletion`, async () => {
    let calls = 0;
    await assert.rejects(archiveStudentRecord('student', '사유', { client: { rpc: async () => { calls++; return { error }; } } }), result => result.code === code);
    assert.equal(calls, 1);
  });
}
test('archive lost responses and unexpected acknowledgements are unknown outcomes', async () => {
  for (const response of [undefined, { status: 'unexpected' }]) {
    let calls = 0;
    await assert.rejects(archiveStudentRecord('student', '', { client: { rpc: async () => { calls++; return { data: response, error: null }; } } }), error => error.code === 'STUDENT_ARCHIVE_UNCONFIRMED');
    assert.equal(calls, 1);
  }
  await assert.rejects(archiveStudentRecord('student', '', { client: { rpc: async () => { throw new Error('private detail'); } } }), error => error.code === 'STUDENT_ARCHIVE_UNCONFIRMED' && !error.message.includes('private detail'));
});
test('archive rejects missing student/child identifiers before a request', async () => {
  let calls = 0;
  for (const id of ['', 'child-']) await assert.rejects(archiveStudentRecord(id, '', { client: { rpc: async () => { calls++; } } }), error => error.code === 'REQUIRED_DATA_MISSING');
  assert.equal(calls, 0);
});

const refundInput = patch => ({ record: { id: 'record', is_inferred: false }, status: 'completed', amount: 50000, memo: ' 가상 메모 ', ...patch });
function refundClient({ error = null, rowId = 'record', reject = false } = {}) {
  const calls = [];
  const client = { from(table) {
    const call = { table }; calls.push(call);
    const query = {
      update(payload) { call.payload = payload; return query; },
      eq(...args) { call.filter = args; return query; },
      select(columns) { call.columns = columns; return query; },
      single: async () => {
        if (reject) throw new Error('private detail');
        return { data: rowId ? { id: rowId } : null, error };
      },
    };
    return query;
  } };
  return { client, calls, now: () => new Date('2026-11-25T01:00:00.000Z') };
}
for (const status of ['completed', 'pending', 'none']) {
  test(`refund record ${status} updates bookkeeping fields only`, async () => {
    const dependencies = refundClient();
    await saveRefundRecord(refundInput({ status }), dependencies);
    assert.deepEqual(dependencies.calls, [{ table: 'user_withdrawals', payload: {
      refund_status: status, refund_amount: 50000, refund_memo: '가상 메모', refunded_at: status === 'completed' ? '2026-11-25T01:00:00.000Z' : null,
    }, filter: ['id', 'record'], columns: 'id' }]);
  });
}
test('inferred records cannot be persisted and invalid amounts/status cannot reach DB', async () => {
  const dependencies = refundClient();
  for (const record of [{ id: 'record', is_inferred: true }, { id: 'deleted-user:fake', is_inferred: false }]) {
    await assert.rejects(saveRefundRecord(refundInput({ record }), dependencies), error => error.code === 'DATA_REFERENCE_ERROR');
  }
  for (const amount of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(saveRefundRecord(refundInput({ amount }), dependencies), error => error.code === 'INPUT_INVALID');
  }
  await assert.rejects(saveRefundRecord(refundInput({ status: 'invalid' }), dependencies), error => error.code === 'INPUT_INVALID');
  assert.equal(dependencies.calls.length, 0);
});
test('refund denial is normalized; missing update rows and lost responses are not confirmed saves', async () => {
  await assert.rejects(saveRefundRecord(refundInput(), refundClient({ error: { code: '42501', message: 'private detail' } })), error => error.code === 'PERMISSION_DENIED' && !error.message.includes('private detail'));
  for (const dependencies of [refundClient({ rowId: null }), refundClient({ rowId: 'other' }), refundClient({ reject: true })]) {
    await assert.rejects(saveRefundRecord(refundInput(), dependencies), error => error.code === 'REFUND_RECORD_SAVE_UNCONFIRMED');
    assert.equal(dependencies.calls.length, 1);
  }
});

const source = readFileSync(new URL('../src/pages/admin/students/views/AdminStudentTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudentTab.tsx', source, ts.ScriptTarget.Latest, true);
const definitions = new Map();
let effect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) definitions.set(node.name.text, node.initializer.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0].getText(ast).includes('lifecycleSequence.current')) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const names = ['refreshStudentLifecycle', 'handleSaveRefund', 'handleDepartStudent', 'handleConfirmDelete'];
const code = ts.transpile(names.map(name => `const ${name} = ${definitions.get(name)};`).join('\n') + `\nconst effect = ${effect};`, { target: ts.ScriptTarget.ES2022 });
function screen(options = {}) {
  const state = { archiveCalls: [], refundCalls: [], reads: 0, alerts: [], errors: [], refundOpen: true, deleteOpen: true, closedEditors: 0, saveLoading: false, deleteLoading: false, refundSaving: false };
  const dependencies = {
    AppError, supabase: {}, selectedWithdrawal: { id: 'record' }, refundStatus: 'completed', refundAmount: 50000, refundMemo: '메모',
    targetStudentForDelete: { id: 'student', name: '가상 원생' }, confirmInputName: options.confirmName ?? '가상 원생', saveLoading: false, deleteLoading: false,
    refundInFlight: { current: false }, archiveInFlight: { current: false }, saveInFlight: { current: false }, billingMutationInFlight: { current: false },
    lifecycleSequence: { current: 0 }, detailLoadSequence: { current: 0 },
    prompt: () => options.reason === undefined ? '사유' : options.reason, confirm: () => options.confirm !== false,
    alert: message => { state.alerts.push(message); }, handleError: async (error, fallback) => { state.errors.push({ error, fallback }); },
    setRefundSaving: value => { state.refundSaving = value; }, setSaveLoading: value => { state.saveLoading = value; }, setDeleteLoading: value => { state.deleteLoading = value; },
    setRefundModalOpen: value => { state.refundOpen = value; }, setDeleteModalOpen: value => { state.deleteOpen = value; }, setTargetStudentForDelete() {},
    closeStudentModal: () => { state.closedEditors++; },
    archiveStudentRecord: async (...args) => { state.archiveCalls.push(args); if (options.archive) await options.archive(...args); },
    saveRefundRecord: async (...args) => { state.refundCalls.push(args); if (options.refund) await options.refund(...args); },
    loadData: async (...args) => { state.reads++; return options.read ? await options.read(...args) : {}; },
    loadWithdrawals: async (...args) => { state.reads++; return options.read ? await options.read(...args) : []; },
  };
  const handlers = new Function(...Object.keys(dependencies), `${code}\nreturn { refund: handleSaveRefund, depart: handleDepartStudent, remove: handleConfirmDelete, mount: effect };`)(...Object.values(dependencies));
  return { state, dependencies, ...handlers };
}
const student = { id: 'student' };
for (const kind of ['refund', 'depart', 'remove']) {
  const writeKind = kind === 'refund' ? 'refund' : 'archive';
  test(`${kind} duplicate clicks send one write and release synchronous/loading flags`, async () => {
    let finish;
    const current = screen({ [writeKind]: () => new Promise(resolve => { finish = resolve; }) });
    const pending = current[kind](student); await current[kind](student);
    assert.equal(current.state[writeKind + 'Calls'].length, 1);
    finish(); await pending;
    assert.equal(current.state.alerts.length, 1); assert.equal(current.state.reads, 2);
    for (const flag of ['saveLoading', 'deleteLoading', 'refundSaving']) assert.equal(current.state[flag], false);
    assert.equal(current.dependencies.archiveInFlight.current, false); assert.equal(current.dependencies.refundInFlight.current, false);
  });
  test(`${kind} write denial keeps the dialog and never refreshes or announces success`, async () => {
    const current = screen({ [writeKind]: async () => { throw new AppError('PERMISSION_DENIED'); } });
    await current[kind](student);
    assert.equal(current.state.reads, 0); assert.equal(current.state.alerts.length, 0);
    assert.equal(current.state.errors[0].error.code, 'PERMISSION_DENIED');
    assert.equal(current.state.closedEditors, 0); assert.equal(current.state.refundOpen, true); assert.equal(current.state.deleteOpen, true);
  });
  test(`${kind} saved-but-refresh-failed is reported separately without another write`, async () => {
    const current = screen({ read: async () => { throw new AppError('PERMISSION_DENIED'); } });
    await current[kind](student);
    assert.equal(current.state.errors[0].error.code, 'STUDENT_ACTION_REFRESH_FAILED');
    assert.equal(current.state[writeKind + 'Calls'].length, 1); assert.equal(current.state.alerts.length, 0);
  });
  test(`${kind} late responses do not close or refresh another branch`, async () => {
    let finish;
    const current = screen({ [writeKind]: () => new Promise(resolve => { finish = resolve; }) });
    const pending = current[kind](student); current.dependencies.lifecycleSequence.current++;
    finish(); await pending;
    assert.equal(current.state.reads, 0); assert.equal(current.state.alerts.length, 0); assert.equal(current.state.closedEditors, 0);
  });
  test(`${kind} unknown outcome closes only the relevant stale editor without retry`, async () => {
    const current = screen({ [writeKind]: async () => { throw new AppError(kind === 'refund' ? 'REFUND_RECORD_SAVE_UNCONFIRMED' : 'STUDENT_ARCHIVE_UNCONFIRMED'); } });
    await current[kind](student);
    assert.equal(current.state[writeKind + 'Calls'].length, 1); assert.equal(current.state.reads, 0);
    if (kind === 'refund') assert.equal(current.state.refundOpen, false);
    if (kind === 'remove') assert.equal(current.state.deleteOpen, false);
    if (kind === 'depart') assert.equal(current.state.closedEditors, 1);
  });
}
test('archive entry points share a guard and conflict with refund writes', async () => {
  let finish;
  const current = screen({ archive: () => new Promise(resolve => { finish = resolve; }) });
  const pending = current.depart(student); await current.remove(); await current.refund();
  assert.equal(current.state.archiveCalls.length, 1); assert.equal(current.state.refundCalls.length, 0);
  finish(); await pending;
});
test('refund entry point blocks archive, student-save and billing conflicts', async () => {
  for (const key of ['archiveInFlight', 'saveInFlight', 'billingMutationInFlight']) {
    const current = screen(); current.dependencies[key].current = true; await current.refund();
    assert.equal(current.state.refundCalls.length, 0);
  }
});
test('archive cancellation and name confirmation mismatch send no request', async () => {
  for (const options of [{ reason: null }, { confirm: false }]) {
    const current = screen(options); await current.depart(student); assert.equal(current.state.archiveCalls.length, 0);
  }
  const current = screen({ confirmName: '다른 이름' }); await current.remove(); assert.equal(current.state.archiveCalls.length, 0);
});
test('lifecycle effect cleanup invalidates pending responses on branch change or unmount', async () => {
  let finish;
  const current = screen({ archive: () => new Promise(resolve => { finish = resolve; }) });
  const cleanup = current.mount(); const pending = current.depart(student); cleanup(); finish(); await pending;
  assert.equal(current.state.reads, 0); assert.equal(current.state.closedEditors, 0);
});
const appCatalog = new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('lifecycle error messages are synchronized with app copies', { skip: !existsSync(appCatalog) }, () => {
  const app = readFileSync(appCatalog, 'utf8');
  for (const key of ['STUDENT_ARCHIVE_UNCONFIRMED', 'REFUND_RECORD_SAVE_UNCONFIRMED', 'STUDENT_ACTION_REFRESH_FAILED']) assert.equal(app.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1], errorMessages[key]);
});
