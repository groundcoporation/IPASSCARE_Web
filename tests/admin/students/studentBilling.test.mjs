import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { addStudentAdditionalBilling, correctStudentBillingPlan } from '../../../src/pages/admin/students/api/studentBilling.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';

for (const [name, operation, expectedRpc, expectedParams] of [
  ['additional billing', addStudentAdditionalBilling, 'add_current_month_student_additional_billing_plan', { p_student_id: 'first', p_package_option_id: 'second' }],
  ['plan correction', correctStudentBillingPlan, 'correct_billing_plan_to_owned_package', { p_plan_id: 'first', p_user_package_id: 'second' }],
]) {
  test(`${name} uses the original RPC and parameter contract once`, async () => {
    const calls = [];
    await operation('first', 'second', { client: { rpc: async (...args) => { calls.push(args); return { error: null }; } } });
    assert.deepEqual(calls, [[expectedRpc, expectedParams]]);
  });
  for (const [error, code] of [
    [{ code: '42501', message: 'private detail' }, 'PERMISSION_DENIED'],
    [{ code: 'PGRST202', message: 'private detail' }, 'SERVER_UPDATE_REQUIRED'],
    [{ code: 'P0001', message: '[BILL_DUPLICATE_OPTION]' }, 'BILL_DUPLICATE_OPTION'],
    [{ message: 'private detail' }, 'BILL_PLAN_CHANGE_UNCONFIRMED'],
  ]) {
    test(`${name} maps ${code} without retry or direct table fallback`, async () => {
      let calls = 0;
      await assert.rejects(operation('first', 'second', { client: { rpc: async () => { calls++; return { error }; } } }), result =>
        result.code === code && !result.message.includes('private detail'));
      assert.equal(calls, 1);
    });
  }
  test(`${name} treats lost responses as unknown outcomes and does not repeat the RPC`, async () => {
    let calls = 0;
    await assert.rejects(operation('first', 'second', { client: { rpc: async () => { calls++; throw new Error('private detail'); } } }), error => error.code === 'BILL_PLAN_CHANGE_UNCONFIRMED');
    assert.equal(calls, 1);
  });
  test(`${name} rejects missing IDs without sending a request`, async () => {
    let calls = 0;
    const dependencies = { client: { rpc: async () => { calls++; } } };
    await assert.rejects(operation('', 'second', dependencies), error => error.code === 'REQUIRED_DATA_MISSING');
    await assert.rejects(operation('first', ' ', dependencies), error => error.code === 'REQUIRED_DATA_MISSING');
    assert.equal(calls, 0);
  });
}

const source = readFileSync(new URL('../../../src/pages/admin/students/views/AdminStudentTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudentTab.tsx', source, ts.ScriptTarget.Latest, true);
const definitions = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) definitions.set(node.name.text, node.initializer.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const names = ['refreshStudentBillingEditor', 'handleAddCurrentMonthAdditionalBill', 'handleCorrectCurrentBillingPlan'];
const code = ts.transpile(names.map(name => `const ${name} = ${definitions.get(name)};`).join('\n'), { target: ts.ScriptTarget.ES2022 });
const mismatch = { planId: 'plan', userPackageId: 'owned', plannedLabel: '계획 옵션', actualLabel: '실제 옵션' };
function screen(options = {}) {
  const state = { additional: false, correction: false, alerts: [], errors: [], addCalls: 0, correctCalls: 0, reads: 0, opened: [], closes: 0 };
  const freshOptions = [{ id: 'fresh-option' }];
  const freshStudent = { id: 'student', student_name: '최신 원생' };
  const dependencies = {
    AppError, supabase: {}, editingId: 'student', additionalPackageOptionId: 'option', studentName: '가상 원생',
    packageOptions: [{ id: 'option', label: '가상 옵션', price: 1000, packages: { name: '이용권' } }], currentMonthPackages: [],
    billingMutationInFlight: { current: false }, saveInFlight: { current: false }, archiveInFlight: { current: false }, refundInFlight: { current: false }, detailLoadSequence: { current: 1 },
    confirm: () => options.confirm !== false,
    alert: message => { state.alerts.push(message); },
    handleError: async (error, fallback) => { state.errors.push({ error, fallback }); },
    closeStudentModal: () => { state.closes++; },
    setAdditionalBillSaving: value => { state.additional = value; }, setBillingPlanCorrectionSaving: value => { state.correction = value; },
    addStudentAdditionalBilling: async (...args) => { state.addCalls++; if (options.add) await options.add(...args); },
    correctStudentBillingPlan: async (...args) => { state.correctCalls++; if (options.correct) await options.correct(...args); },
    loadData: async (...args) => { state.reads++; return options.read ? await options.read(...args) : { students: [freshStudent], packageOptions: freshOptions }; },
    openModal: async (...args) => { state.opened.push(args); return options.open ? await options.open(...args) : true; },
  };
  const handlers = new Function(...Object.keys(dependencies), `${code}\nreturn { add: handleAddCurrentMonthAdditionalBill, correct: handleCorrectCurrentBillingPlan };`)(...Object.values(dependencies));
  return { state, dependencies, freshStudent, freshOptions, ...handlers };
}
for (const kind of ['add', 'correct']) {
  test(`${kind} duplicate clicks produce one mutation and always release flags`, async () => {
    let finish;
    const current = screen({ [kind]: () => new Promise(resolve => { finish = resolve; }) });
    const pending = current[kind](mismatch); await current[kind](mismatch);
    assert.equal(current.state[kind === 'add' ? 'addCalls' : 'correctCalls'], 1);
    finish(); await pending;
    assert.equal(current.dependencies.billingMutationInFlight.current, false);
    assert.equal(current.state.additional, false); assert.equal(current.state.correction, false);
    assert.equal(current.state.alerts.length, 1);
  });
  test(`${kind} refresh uses the freshly loaded student and catalog, not stale component state`, async () => {
    const current = screen(); await current[kind](mismatch);
    assert.equal(current.state.opened[0][0], current.freshStudent);
    assert.equal(current.state.opened[0][1].packageOptions, current.freshOptions);
    assert.equal(current.state.opened[0][1].reportError, false);
  });
  test(`${kind} mutation failure does not refresh, show success or retry`, async () => {
    const current = screen({ [kind]: async () => { throw new AppError('SERVER_UPDATE_REQUIRED'); } });
    await current[kind](mismatch);
    assert.equal(current.state.reads, 0); assert.equal(current.state.alerts.length, 0);
    assert.equal(current.state.errors[0].error.code, 'SERVER_UPDATE_REQUIRED');
    assert.equal(current.dependencies.billingMutationInFlight.current, false);
    assert.equal(current.state.closes, 0);
  });
  test(`${kind} unknown write outcome closes the stale editor before any manual retry`, async () => {
    const current = screen({ [kind]: async () => { throw new AppError('BILL_PLAN_CHANGE_UNCONFIRMED'); } });
    await current[kind](mismatch);
    assert.equal(current.state.closes, 1); assert.equal(current.state.reads, 0);
    assert.equal(current.state.alerts.length, 0);
  });
  test(`${kind} saved-but-refresh-failed is distinct from mutation failure`, async () => {
    const current = screen({ read: async () => { throw new AppError('PERMISSION_DENIED'); } });
    await current[kind](mismatch);
    assert.equal(current.state.errors[0].error.code, 'BILL_PLAN_REFRESH_FAILED');
    assert.equal(current.state.alerts.length, 0);
    assert.equal(current.state[kind === 'add' ? 'addCalls' : 'correctCalls'], 1);
  });
  test(`${kind} saved-but-detail-failed does not prompt another mutation`, async () => {
    const current = screen({ open: async () => { throw new AppError('STUDENT_LOAD_FAILED'); } });
    await current[kind](mismatch);
    assert.equal(current.state.errors[0].error.code, 'BILL_PLAN_REFRESH_FAILED');
    assert.equal(current.state.alerts.length, 0);
  });
  test(`${kind} response after editor change does not refresh or reopen old data`, async () => {
    let finish;
    const current = screen({ [kind]: () => new Promise(resolve => { finish = resolve; }) });
    const pending = current[kind](mismatch); current.dependencies.detailLoadSequence.current++;
    finish(); await pending;
    assert.equal(current.state.reads, 0); assert.equal(current.state.opened.length, 0); assert.equal(current.state.alerts.length, 0);
  });
  test(`${kind} cancellation sends no request`, async () => {
    const current = screen({ confirm: false }); await current[kind](mismatch);
    assert.equal(current.state.addCalls + current.state.correctCalls, 0);
  });
}
test('additional billing and correction share one synchronous guard', async () => {
  let finish;
  const current = screen({ add: () => new Promise(resolve => { finish = resolve; }) });
  const pending = current.add(); await current.correct(mismatch);
  assert.equal(current.state.correctCalls, 0); finish(); await pending;
});
test('already-selected additional options are rejected before calling RPC', async () => {
  const current = screen(); current.dependencies.currentMonthPackages.push({ package_option_id: 'option' });
  await current.add(); assert.equal(current.state.addCalls, 0);
  assert.equal(current.state.errors[0].error.code, 'BILL_DUPLICATE_OPTION');
});
test('student save/archive in progress blocks both billing mutations', async () => {
  for (const key of ['saveInFlight', 'archiveInFlight', 'refundInFlight']) {
    const current = screen(); current.dependencies[key].current = true;
    await current.add(); await current.correct(mismatch);
    assert.equal(current.state.addCalls + current.state.correctCalls, 0);
  }
});
test('changed context during roster refresh does not reopen an old editor', async () => {
  let finish;
  const current = screen({ read: () => new Promise(resolve => { finish = resolve; }) });
  const pending = current.add(); await new Promise(resolve => setImmediate(resolve));
  current.dependencies.detailLoadSequence.current++;
  finish({ students: [current.freshStudent], packageOptions: current.freshOptions }); await pending;
  assert.equal(current.state.opened.length, 0); assert.equal(current.state.alerts.length, 0);
});
const appCatalog = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('billing plan error messages are synchronized with app copies', { skip: !existsSync(appCatalog) }, () => {
  const app = readFileSync(appCatalog, 'utf8');
  for (const key of ['BILL_PLAN_CHANGE_UNCONFIRMED', 'BILL_PLAN_REFRESH_FAILED']) assert.equal(app.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1], errorMessages[key]);
});
