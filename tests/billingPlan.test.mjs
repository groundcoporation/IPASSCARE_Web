import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { AppError, normalizeError } from '../src/errors/appError.ts';
import { saveStandardBillingPlan, addAdditionalBillingPlan, deleteAdditionalBillingPlan } from '../src/pages/admin/billing/api/billingPlan.ts';
import { standardOptionIdsForStudent, allOptionIdsForStudent, billingCommercialIdentity } from '../src/pages/admin/billing/model/billingPlan.ts';

const studentId = '11111111-1111-4111-8111-111111111111';
const optionId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const month = '2026-11';
const standardReply = { success: true, effective_month: month + '-01', package_count: 1 };
const additionalReply = { success: true, student_id: studentId, package_option_id: optionId, plan_id: planId, bill_month: month };
function mock(reply) {
  const calls = [];
  return { calls, client: { rpc: async (...args) => { calls.push(args); if (reply instanceof Error) throw reply; return reply; } } };
}
const cases = [
  ['standard', d => saveStandardBillingPlan(studentId, month, [optionId, optionId], d), 'save_student_monthly_package_plan', { p_student_id: studentId, p_effective_month: month + '-01', p_package_option_ids: [optionId] }, standardReply],
  ['additional', d => addAdditionalBillingPlan(studentId, month, optionId, d), 'add_student_additional_billing_plan', { p_student_id: studentId, p_package_option_id: optionId, p_effective_month: month + '-01' }, additionalReply],
  ['delete additional', d => deleteAdditionalBillingPlan(studentId, month, planId, optionId, d), 'delete_planned_additional_student_billing_item', { p_plan_id: planId }, additionalReply],
];
for (const [name, run, rpc, params, reply] of cases) {
  test(name + ' preserves the RPC and validates the returned plan identity', async () => {
    const d = mock({ data: reply }); await run(d); assert.deepEqual(d.calls, [[rpc, params]]);
  });
  for (const [code, expected] of [['42501', 'PERMISSION_DENIED'], ['PGRST202', 'SERVER_UPDATE_REQUIRED'], ['PGRST301', 'AUTH_REQUIRED']]) {
    test(name + ' keeps ' + expected + ' without a retry or table fallback', async () => {
      const d = mock({ error: { code, message: 'private details' } }); await assert.rejects(run(d), e => e.code === expected && !e.message.includes('private')); assert.equal(d.calls.length, 1);
    });
  }
  test(name + ' treats lost or invalid acknowledgement as unconfirmed', async () => {
    for (const response of [new Error('private response'), { data: null }, { data: { success: true } }, { data: { ...reply, success: false } }]) {
      const d = mock(response); await assert.rejects(run(d), e => e.code === 'BILL_PLAN_CHANGE_UNCONFIRMED'); assert.equal(d.calls.length, 1);
    }
  });
}
test('standard plans allow an explicit empty replacement without mutating the input', async () => {
  const ids = []; const d = mock({ data: { ...standardReply, package_count: 0 } }); await saveStandardBillingPlan(studentId, month, ids, d); assert.deepEqual(ids, []); assert.deepEqual(d.calls[0][1].p_package_option_ids, []);
});
test('mismatched month, count, student, option or plan cannot be counted as saved', async () => {
  for (const [run, reply] of [[cases[0][1], { ...standardReply, package_count: 2 }], [cases[0][1], { ...standardReply, effective_month: '2026-12-01' }], [cases[1][1], { ...additionalReply, student_id: planId }], [cases[1][1], { ...additionalReply, package_option_id: planId }], [cases[2][1], { ...additionalReply, plan_id: studentId }], [cases[2][1], { ...additionalReply, bill_month: '2026-12' }]]) {
    await assert.rejects(run(mock({ data: reply })), e => e.code === 'BILL_PLAN_CHANGE_UNCONFIRMED');
  }
});
test('invalid identity and month are rejected before any RPC', async () => {
  const d = mock({});
  for (const run of [() => saveStandardBillingPlan('bad', month, [], d), () => saveStandardBillingPlan(studentId, month, ['bad'], d), () => addAdditionalBillingPlan(studentId, '2026-13', optionId, d), () => deleteAdditionalBillingPlan(studentId, month, 'bad', optionId, d)]) await assert.rejects(run());
  assert.equal(d.calls.length, 0);
});
test('locked plans never automatically create an additional charge inside the service', async () => {
  const d = mock({ error: { message: '[BILL_PLAN_LOCKED]' } }); await assert.rejects(cases[0][1](d), e => e.code === 'BILL_PLAN_LOCKED'); assert.equal(d.calls.length, 1);
});
const target = patch => ({ studentId, userPackageId: 'plan:' + planId, optionId, packageName: '가상 이용권', optionLabel: '주 2회', price: 1000, voucherType: 'lesson', ...patch });
const student = patch => ({ studentId, studentName: '가상 학생', packages: [], ...patch });
test('plan model keeps standard IDs separate from additional and already-owned passes', () => {
  const s = student({ packages: [target(), target(), target({ isAdditional: true, optionId: planId }), target({ userPackageId: 'owned', optionId: studentId })] }); const before = structuredClone(s);
  assert.deepEqual(standardOptionIdsForStudent(s), [optionId]); assert.deepEqual([...allOptionIdsForStudent(s)], [optionId, planId, studentId]); assert.deepEqual(s, before);
});
test('commercial duplicate identity preserves label punctuation, type and amount rules', () => {
  assert.equal(billingCommercialIdentity({ label: '주 · 2_회', price: 1000 }), billingCommercialIdentity({ optionLabel: '주2회', price: 1000, voucherType: 'lesson' }));
  assert.notEqual(billingCommercialIdentity({ label: 'A', price: 1000 }), billingCommercialIdentity({ label: 'A', price: 1001 }));
});

const source = readFileSync(new URL('../src/pages/admin/billing/views/AdminBillingTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminBillingTab.tsx', source, ts.ScriptTarget.Latest, true);
const handlers = new Map();
function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) handlers.set(n.name.getText(ast), n.initializer.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, deps) {
  const code = ts.transpile('const handler = ' + handlers.get(name) + ';', { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps));
}
function screen(options = {}) {
  const state = { calls: [], errors: [], alerts: [], prompts: 0, loading: false, choices: { [studentId]: optionId }, refreshes: [] };
  const deps = { normalizeError, billingCommercialIdentity, standardOptionIdsForStudent, allOptionIdsForStudent,
    packageOptionToAddByStudent: state.choices, billingPackageOptions: [{ id: optionId, packageName: '가상 이용권', label: '주 2회', price: 1000 }],
    billingMonthByOffset: offset => offset === 0 ? month : '2026-12', selectedMonth: month, actionLoading: false, billingBusyRef: { current: false }, billingReadSequence: { current: 1 }, targetBillStatuses: {}, supabase: {},
    confirm: () => { state.prompts++; return options.confirm !== false; }, alert: message => state.alerts.push(message),
    handleError: async (error, fallback) => state.errors.push(normalizeError(error, fallback)),
    setActionLoading: value => { state.loading = value; }, setPackageOptionToAddByStudent: updater => { state.choices = updater(state.choices); },
    refreshAfterBillAction: async (...args) => { state.refreshes.push(args); if (options.refreshError) throw new AppError('BILL_PLAN_REFRESH_FAILED'); },
  };
  for (const name of ['saveStandardBillingPlan', 'addAdditionalBillingPlan', 'deleteAdditionalBillingPlan']) deps[name] = async (...args) => { state.calls.push([name, ...args]); if (options.write) return options.write(name); };
  return { state, deps, run: name => compile(name, deps) };
}
test('basic add preserves selected options and refreshes using the plan-specific code', async () => {
  const s = screen(); await s.run('handleAddBillingPackage')(student());
  assert.equal(s.state.calls[0][0], 'saveStandardBillingPlan'); assert.deepEqual(s.state.calls[0][3], [optionId]); assert.equal(s.state.choices[studentId], ''); assert.deepEqual(s.state.refreshes, [[1, 'BILL_PLAN_REFRESH_FAILED']]);
});
test('additional add requires confirmation and never rewrites the standard set', async () => {
  const s = screen(); await s.run('handleAddBillingPackage')(student(), true); assert.equal(s.state.prompts, 1); assert.equal(s.state.calls[0][0], 'addAdditionalBillingPlan');
  const cancelled = screen({ confirm: false }); await cancelled.run('handleAddBillingPackage')(student(), true); assert.equal(cancelled.state.calls.length, 0);
});
test('duplicate IDs and commercially identical options cannot create writes', async () => {
  for (const option of [target(), target({ optionId: planId })]) {
    const s = screen(); await s.run('handleAddBillingPackage')(student({ packages: [option] })); assert.equal(s.state.calls.length, 0); assert.equal(s.state.errors[0].code, 'BILL_DUPLICATE_OPTION');
  }
});
test('locked standard plan can become an additional charge only after explicit confirmation', async () => {
  const s = screen({ write: async name => { if (name === 'saveStandardBillingPlan') throw new AppError('BILL_PLAN_LOCKED'); } });
  await s.run('handleAddBillingPackage')(student()); assert.deepEqual(s.state.calls.map(c => c[0]), ['saveStandardBillingPlan', 'addAdditionalBillingPlan']); assert.equal(s.state.prompts, 1);
});
test('unknown write and refresh failure cannot trigger locked-plan fallback', async () => {
  for (const options of [{ write: async () => { throw new AppError('BILL_PLAN_CHANGE_UNCONFIRMED'); } }, { refreshError: true }]) {
    const s = screen(options); await s.run('handleAddBillingPackage')(student()); assert.equal(s.state.calls.length, 1); assert.equal(s.state.prompts, 0); assert.equal(s.state.errors.length, 1); assert.equal(s.deps.billingBusyRef.current, false);
  }
});
test('locked fallback and explicit additional add are unavailable outside current/next month', async () => {
  const s = screen({ write: async () => { throw new AppError('BILL_PLAN_LOCKED'); } }); s.deps.selectedMonth = '2027-01';
  await s.run('handleAddBillingPackage')(student()); assert.equal(s.state.calls.length, 1); assert.equal(s.state.prompts, 0);
  const direct = screen(); direct.deps.selectedMonth = '2027-01'; await direct.run('handleAddBillingPackage')(student(), true); assert.equal(direct.state.calls.length, 0);
});
test('changed view cannot clear a new option choice or offer stale fallback', async () => {
  for (const locked of [false, true]) {
    let finish; const s = screen({ write: () => new Promise((resolve, reject) => { finish = locked ? () => reject(new AppError('BILL_PLAN_LOCKED')) : resolve; }) });
    const pending = s.run('handleAddBillingPackage')(student()); s.deps.billingReadSequence.current++; finish(); await pending;
    assert.equal(s.state.choices[studentId], optionId); assert.equal(s.state.prompts, 0); assert.equal(s.state.calls.length, 1);
  }
});
test('add blocks duplicate clicks during a pending save and releases loading', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run('handleAddBillingPackage')(student(), true); await s.run('handleAddBillingPackage')(student(), true);
  assert.equal(s.state.calls.length, 1); assert.equal(s.state.prompts, 1); finish(); await pending; assert.equal(s.state.loading, false);
});
test('standard planned removal retains other IDs; additional removal uses only its plan identity', async () => {
  const standard = screen(); await standard.run('handleDeleteBillingPackage')(student({ packages: [target(), target({ optionId: planId })] }), target());
  assert.equal(standard.state.calls[0][0], 'saveStandardBillingPlan'); assert.deepEqual(standard.state.calls[0][3], [planId]);
  const additional = screen(); await additional.run('handleDeleteBillingPackage')(student(), target({ isAdditional: true }));
  assert.deepEqual(additional.state.calls[0].slice(0, 5), ['deleteAdditionalBillingPlan', studentId, month, planId, optionId]);
});
test('non-plan, mismatched-student, owned and already-billed targets cannot be removed', async () => {
  for (const patch of [{ userPackageId: 'owned' }, { studentId: planId }, { hasTargetMonthPackage: true }]) {
    const s = screen(); await s.run('handleDeleteBillingPackage')(student(), target(patch)); assert.equal(s.state.calls.length, 0);
  }
  const s = screen(); s.deps.targetBillStatuses[studentId + ':' + optionId + ':' + month] = { status: 'unpaid' };
  await s.run('handleDeleteBillingPackage')(student(), target()); assert.equal(s.state.calls.length, 0);
});
test('planned removal blocks duplicate prompts and distinguishes refresh failure', async () => {
  let finish; const s = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
  const pending = s.run('handleDeleteBillingPackage')(student(), target({ isAdditional: true })); await s.run('handleDeleteBillingPackage')(student(), target({ isAdditional: true }));
  assert.equal(s.state.prompts, 1); finish(); await pending; assert.equal(s.deps.billingBusyRef.current, false);
  const failed = screen({ refreshError: true }); await failed.run('handleDeleteBillingPackage')(student(), target({ isAdditional: true })); assert.equal(failed.state.errors[0].code, 'BILL_PLAN_REFRESH_FAILED'); assert.equal(failed.state.alerts.length, 0);
});
