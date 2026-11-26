import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { billingTargetKey, prepareBillGeneration } from '../src/pages/admin/billing/model/billGeneration.ts';
import { createBillBatch } from '../src/pages/admin/billing/api/billCreation.ts';
import { AppError, formatError, errorMessages } from '../src/errors/appError.ts';
import { normalizeDiscountPercent } from '../src/utils/billingAmount.ts';

const target = patch => ({ studentId: 'student', userPackageId: 'plan:plan-id', optionId: 'option', price: 1000, packageName: '가상 이용권', optionLabel: '가상 옵션', classNames: ['수업 A'], ...patch });
const adjustment = patch => ({ mode: 'none', percent: '', finalAmounts: {}, reason: '', ...patch });
const prepare = (targets, config = adjustment()) => prepareBillGeneration(targets, '2026-11', config);
const billId = '11111111-1111-4111-8111-111111111111';

test('prepared RPC parameters preserve basic, plan and memo fields without mutating targets', () => {
  const targets = [target()]; const before = structuredClone(targets);
  assert.deepEqual(prepare(targets, adjustment({ reason: ' 사유 ' }))[0].parameters, {
    p_student_id: 'student', p_plan_id: 'plan-id', p_package_option_id: 'option', p_bill_month: '2026-11',
    p_original_amount: 1000, p_discount_type: 'none', p_discount_value: 0, p_discount_amount: 0, p_amount_due: 1000,
    p_adjustment_reason: '사유', p_memo: '보유 이용권: 가상 이용권 (가상 옵션) | 연결 수업: 수업 A',
  });
  assert.deepEqual(targets, before);
});
test('batch percentage discounts retain total-first remainder allocation', () => {
  const items = prepare([target({ price: 1001 }), target({ price: 2002 }), target({ price: 3003 })], adjustment({ mode: '5percent' }));
  assert.deepEqual(items.map(item => item.parameters.p_amount_due), [951, 1902, 2852]);
  assert.equal(items.reduce((sum, item) => sum + item.parameters.p_amount_due, 0), 5705);
  assert.equal(items.every(item => item.parameters.p_discount_type === 'percent' && item.parameters.p_discount_value === 5), true);
});
test('custom percentage keeps two-decimal normalization and fixed ten percent is preserved', () => {
  const custom = prepare([target()], adjustment({ mode: 'custom_percent', percent: '12.345' }));
  assert.equal(custom[0].parameters.p_discount_value, 12.35);
  assert.equal(custom[0].parameters.p_amount_due, 876);
  assert.equal(prepare([target()], adjustment({ mode: '10percent' }))[0].parameters.p_amount_due, 900);
});
test('custom amounts keep per-target keys, zero and surcharge behavior', () => {
  const first = target(); const second = target({ userPackageId: 'web:mapping', isShared: true });
  const items = prepare([first, second], adjustment({ mode: 'custom_amount', finalAmounts: { [billingTargetKey(first)]: '0', [billingTargetKey(second)]: '1,250' } }));
  assert.equal(items[0].parameters.p_amount_due, 0);
  assert.equal(items[1].parameters.p_amount_due, 1250);
  assert.equal(items[1].parameters.p_discount_amount, -250);
  assert.equal(items[1].parameters.p_discount_value, 1250);
  assert.equal(items[1].parameters.p_plan_id, null);
  assert.match(items[1].parameters.p_memo, /가족 공용/);
});
test('missing options are local item errors; invalid adjustments are rejected before writes', () => {
  assert.equal(prepare([target({ optionId: null })])[0].error.code, 'BILL_OPTION_INVALID');
  for (const config of [adjustment({ mode: 'custom_percent', percent: '' }), adjustment({ mode: 'custom_percent', percent: '101' }), adjustment({ mode: 'custom_amount', finalAmounts: { [billingTargetKey(target())]: '' } })]) {
    assert.throws(() => prepare([target()], config), error => error.code === 'INPUT_INVALID');
  }
  assert.throws(() => prepareBillGeneration([target()], '2026-13', adjustment()), error => error.code === 'INPUT_INVALID');
});

async function captureLogs(action) {
  const original = console.error; const logs = [];
  console.error = (...args) => { logs.push(args); };
  try { return await action(logs); } finally { console.error = original; }
}
function batchClient(replies) {
  const calls = [];
  const client = { rpc: async (...args) => {
    const index = calls.length; calls.push(args);
    const reply = replies[index];
    if (reply instanceof Error) throw reply;
    return reply;
  } };
  return { client, calls };
}
const confirmed = created => ({ data: { success: true, created, bill_id: billId }, error: null });
test('created and already-existing results use the original RPC once per item', async () => {
  const dependencies = batchClient([confirmed(true), confirmed(false)]);
  const items = prepare([target(), target({ optionId: 'other' })]);
  const result = await createBillBatch(items, dependencies);
  assert.deepEqual(result, { created: 1, existing: 1, failed: 0, unconfirmed: 0, notAttempted: 0, errors: [] });
  assert.deepEqual(dependencies.calls, items.map(item => ['create_manual_student_bill', item.parameters]));
});
test('definitive item failures retain earlier successes and continue other independent items', async () => captureLogs(async logs => {
  const dependencies = batchClient([confirmed(true), { error: { code: '42501', message: 'private detail' } }, confirmed(false)]);
  const result = await createBillBatch(prepare([target(), target(), target()]), dependencies);
  assert.equal(result.created, 1); assert.equal(result.existing, 1); assert.equal(result.failed, 1); assert.equal(result.unconfirmed, 0);
  assert.equal(result.errors[0].code, 'PERMISSION_DENIED'); assert.equal(dependencies.calls.length, 3);
  assert.equal(JSON.stringify(logs).includes('private detail'), false);
}));
test('response loss stops the batch and separates confirmed, unknown and not-attempted counts', async () => captureLogs(async () => {
  const dependencies = batchClient([confirmed(true), new Error('private detail'), confirmed(true)]);
  const result = await createBillBatch(prepare([target(), target(), target()]), dependencies);
  assert.equal(result.created, 1); assert.equal(result.failed, 0); assert.equal(result.unconfirmed, 1); assert.equal(result.notAttempted, 1);
  assert.equal(result.errors[0].code, 'BILL_CREATE_UNCONFIRMED'); assert.equal(dependencies.calls.length, 2);
}));
test('unexpected acknowledgement fields never count as a created or existing bill', async () => captureLogs(async () => {
  for (const data of [null, { success: false }, { success: true, bill_id: billId }, { success: true, created: false }, { success: true, created: true, bill_id: 'private detail' }]) {
    const dependencies = batchClient([{ data, error: null }]);
    const result = await createBillBatch(prepare([target(), target()]), dependencies);
    assert.equal(result.created, 0); assert.equal(result.existing, 0); assert.equal(result.unconfirmed, 1); assert.equal(result.notAttempted, 1); assert.equal(dependencies.calls.length, 1);
  }
}));
test('missing RPC keeps the server update error and does not use direct table fallback', async () => captureLogs(async () => {
  const dependencies = batchClient([{ error: { code: 'PGRST202' } }]);
  const result = await createBillBatch(prepare([target()]), dependencies);
  assert.equal(result.failed, 1); assert.equal(result.errors[0].code, 'SERVER_UPDATE_REQUIRED'); assert.equal(dependencies.calls.length, 1);
}));
test('local option errors do not send RPC requests and preserve other item results', async () => captureLogs(async () => {
  const dependencies = batchClient([confirmed(true)]);
  const result = await createBillBatch(prepare([target({ optionId: null }), target()]), dependencies);
  assert.equal(result.failed, 1); assert.equal(result.created, 1); assert.equal(dependencies.calls.length, 1);
}));
test('logging uses only safe codes/operation and a returned transaction UUID', async () => captureLogs(async logs => {
  const dependencies = batchClient([{ data: { bill_id: billId }, error: { code: '42501', message: 'private name or token' } }]);
  await createBillBatch(prepare([target()]), dependencies);
  assert.equal(logs[0][1].transactionId, billId);
  assert.equal(JSON.stringify(logs).includes('private name or token'), false);
  assert.deepEqual(Object.keys(logs[0][1]).sort(), ['code', 'operation', 'transactionId']);
}));

const source = readFileSync(new URL('../src/pages/admin/billing/views/AdminBillingTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminBillingTab.tsx', source, ts.ScriptTarget.Latest, true);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleGenerateBills') handler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function screen(options = {}) {
  const state = { calls: 0, confirms: 0, loading: false, alerts: [], errors: [], tab: null, month: null, selection: new Set(['selected']), discount: '5percent' };
  const dependencies = {
    AppError, formatError, normalizeDiscountPercent, billingTargetKey, prepareBillGeneration,
    billingBusyRef: { current: false }, billingReadSequence: { current: 1 }, supabase: {}, selectedBillingTargets: [target()],
    previewDiscountMode: '5percent', previewDiscountPercent: '', previewFinalAmounts: {}, previewAdjustmentReason: '',
    activeBranchId: 'branch', branches: [{ id: 'branch', name: '가상 지점' }], selectedBillingStudentCount: 1,
    billingAmountPreview: { originalAmount: 1000, discountAmount: 50, finalAmount: 950 },
    confirm: () => { state.confirms++; return options.confirm !== false; }, alert: message => { state.alerts.push(message); },
    createBillBatch: async (...args) => { state.calls++; return options.create ? await options.create(...args) : { created: 1, existing: 0, failed: 0, unconfirmed: 0, notAttempted: 0, errors: [] }; },
    setActionLoading: value => { state.loading = value; }, handleError: async error => { state.errors.push(error); },
    setPreviewDiscountMode: value => { state.discount = value; }, setPreviewDiscountPercent() {}, setPreviewFinalAmounts() {}, setPreviewAdjustmentReason() {},
    setSelectedBillingTargetIds: value => { state.selection = value; }, setSelectedMonth: value => { state.month = value; }, setSubTab: value => { state.tab = value; },
  };
  const code = ts.transpile(`const handler = ${handler};`, { target: ts.ScriptTarget.ES2022 });
  return { state, dependencies, run: new Function(...Object.keys(dependencies), `${code}\nreturn handler;`)(...Object.values(dependencies)) };
}
test('duplicate generation clicks prompt once, write once and always release the lock', async () => {
  let finish; const current = screen({ create: () => new Promise(resolve => { finish = resolve; }) });
  const pending = current.run('2026-11'); await current.run('2026-11');
  assert.equal(current.state.calls, 1); assert.equal(current.state.confirms, 1);
  finish({ created: 1, existing: 0, failed: 0, unconfirmed: 0, notAttempted: 0, errors: [] }); await pending;
  assert.equal(current.dependencies.billingBusyRef.current, false); assert.equal(current.state.loading, false);
  assert.equal(current.state.tab, 'invoices'); assert.equal(current.state.month, '2026-11'); assert.equal(current.state.selection.size, 0); assert.equal(current.state.discount, 'none');
});
test('partial/unknown results keep adjustment inputs, clear selected items and show separate counts', async () => {
  const current = screen({ create: async () => ({ created: 1, existing: 2, failed: 1, unconfirmed: 1, notAttempted: 3, errors: [new AppError('BILL_CREATE_UNCONFIRMED')] }) });
  await current.run('2026-11');
  assert.equal(current.state.selection.size, 0); assert.equal(current.state.discount, '5percent');
  assert.match(current.state.alerts[0], /결과 미확인 1건/); assert.match(current.state.alerts[0], /미실행 3건/);
  assert.equal(current.state.calls, 1);
});
test('generation results do not navigate or clear a changed view', async () => {
  let finish; const current = screen({ create: () => new Promise(resolve => { finish = resolve; }) });
  const pending = current.run('2026-11'); current.dependencies.billingReadSequence.current++;
  finish({ created: 1, existing: 0, failed: 0, unconfirmed: 0, notAttempted: 0, errors: [] }); await pending;
  assert.equal(current.state.tab, null); assert.equal(current.state.selection.size, 1); assert.equal(current.state.discount, '5percent');
});
test('confirmation cancellation and invalid month cannot issue bills', async () => {
  const cancelled = screen({ confirm: false }); await cancelled.run('2026-11'); assert.equal(cancelled.state.calls, 0);
  const invalid = screen(); await invalid.run('2026-13'); assert.equal(invalid.state.calls, 0); assert.equal(invalid.state.errors[0].code, 'INPUT_INVALID');
});
test('unexpected failures release busy/loading flags and are handled through the common handler', async () => {
  const current = screen({ create: async () => { throw new AppError('INPUT_INVALID'); } });
  await current.run('2026-11');
  assert.equal(current.dependencies.billingBusyRef.current, false); assert.equal(current.state.loading, false); assert.equal(current.state.errors.length, 1);
});
const appCatalog = new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('unknown generation outcome message is synchronized with app copy', { skip: !existsSync(appCatalog) }, () => {
  assert.equal(readFileSync(appCatalog, 'utf8').match(/BILL_CREATE_UNCONFIRMED:\s*"([^"]+)"/)?.[1], errorMessages.BILL_CREATE_UNCONFIRMED);
});
