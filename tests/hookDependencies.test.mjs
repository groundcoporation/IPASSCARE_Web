import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
function definitions(path) {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8'); const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true); const variables = new Map(), effects = [];
  function visit(n) { if (ts.isVariableDeclaration(n) && n.initializer) variables.set(n.name.getText(ast), n.initializer.getText(ast)); if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') effects.push(n.getText(ast)); ts.forEachChild(n, visit); } visit(ast); return { variables, effects };
}
const billing = definitions('../src/pages/admin/billing/views/AdminBillingTab.tsx');
const student = definitions('../src/pages/admin/students/views/AdminStudentTab.tsx');
function runtime() {
  const slots = []; let index = 0; const queued = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    begin() { index = 0; }, flush() { while (queued.length) queued.shift()(); },
    useCallback(fn, deps) { const i = index++; const old = slots[i]; if (!old || !equal(old.deps, deps)) slots[i] = { deps, value: fn }; return slots[i].value; },
    useMemo(fn, deps) { const i = index++; const old = slots[i]; if (!old || !equal(old.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useEffect(fn, deps) { const i = index++; const old = slots[i]; if (!old || !equal(old.deps, deps)) { old?.cleanup?.(); const slot = { deps }; slots[i] = slot; queued.push(() => { slot.cleanup = fn(); }); } },
  };
}
function compile(source, names, effect, deps, hooks) {
  const code = names.map(name => `const ${name} = ${source.variables.get(name)};`).join('\n') + (effect ?? '') + '\nreturn {' + names.join(',') + '};';
  const js = ts.transpile(code, { target: ts.ScriptTarget.ES2022 });
  return () => { hooks.begin(); const result = new Function(...Object.keys(deps), 'useCallback', 'useMemo', 'useEffect', js)(...Object.values(deps), hooks.useCallback, hooks.useMemo, hooks.useEffect); hooks.flush(); return result; };
}
function reads() {
  const calls = []; const hooks = runtime();
  const deps = { activeBranchId: 'branch-a', selectedMonth: '2026-11', subTab: 'invoices', supabase: {}, billingReadSequence: { current: 0 }, automationReadSequence: { current: 0 }, automationReadyBranch: { current: null },
    loadInvoiceData: async (branch, month) => { calls.push(['invoice', branch, month]); return { bills: [], appPaymentRequests: [] }; },
    loadBillingTargetData: async (branch, month) => { calls.push(['targets', branch, month]); return { billingPackageOptions: [], billingRosterStudents: [], targets: [], targetBillStatuses: {} }; },
    loadBillingAutomation: async branch => { calls.push(['automation', branch]); return { enabled: false, lastRunAt: null, targetStudentIds: [] }; },
    setLoading() {}, setBills() {}, setAppPaymentRequests() {}, setBillingPackageOptions() {}, setBillingRosterStudents() {}, setBillingTargets() {}, setTargetBillStatuses() {}, setAutoBillingEnabled() {}, setAutoBillingLastRun() {}, setAutoBillingTargetStudentIds() {}, handleError: async () => {},
  };
  const names = ['loadAutoBillingSetting', 'loadBillingTargets', 'loadBills'];
  const effects = billing.effects.filter(s => s.includes('loadBillingTargets();') || s.includes('void loadAutoBillingSetting();')).join('\n');
  return { deps, calls, render: compile(billing, names, effects, deps, hooks) };
}
test('billing readers/effects stay stable across unchanged renders without repeated reads', () => {
  const s = reads(); const first = s.render(); const second = s.render(); s.render(); assert.equal(first.loadBills, second.loadBills); assert.equal(first.loadBillingTargets, second.loadBillingTargets); assert.deepEqual(s.calls, [['invoice', 'branch-a', '2026-11'], ['automation', 'branch-a']]);
});
test('month change reloads invoice using new month, not automation or old closure', () => {
  const s = reads(); const first = s.render(); s.deps.selectedMonth = '2026-12'; const second = s.render(); assert.notEqual(first.loadBills, second.loadBills); assert.equal(first.loadAutoBillingSetting, second.loadAutoBillingSetting); assert.deepEqual(s.calls.at(-1), ['invoice', 'branch-a', '2026-12']); assert.equal(s.calls.length, 3);
});
test('tab change reads targets once; branch change refreshes current tab and automation only', () => {
  const s = reads(); s.render(); s.deps.subTab = 'targets'; s.render(); s.render(); assert.deepEqual(s.calls.at(-1), ['targets', 'branch-a', '2026-11']);
  s.deps.activeBranchId = 'branch-b'; s.render(); assert.deepEqual(s.calls.slice(-2), [['targets', 'branch-b', '2026-11'], ['automation', 'branch-b']]);
});
const target = { studentId: 'student', optionId: 'option', hasTargetMonthPackage: false, entitlementMismatch: false };
const item = { studentId: 'student', studentName: 'Test', packages: [target] };
function calculations() {
  const hooks = runtime(); const deps = { selectedMonth: '2026-11', targetBillStatuses: {}, searchedBillingTargetStudents: [item], billingTargetStudents: [item], billingSummaryFilter: 'pending', billingTargets: [target], selectedBillingTargetIds: new Set(['student:option']), billingTargetKey: t => `${t.studentId}:${t.optionId}` };
  const names = ['billStatusKey', 'isActiveBillStatus', 'getStudentBillingState', 'visibleBillingTargetStudents', 'billingSummary', 'isSelectableBillingTarget', 'selectedBillingTargets'];
  return { deps, render: compile(billing, names, '', deps, hooks) };
}
test('billing calculators stay stable without stale selected-month/status captures', () => {
  const s = calculations(); const first = s.render(); assert.equal(first.getStudentBillingState(item), 'pending'); assert.equal(s.render().getStudentBillingState, first.getStudentBillingState);
  s.deps.targetBillStatuses = { 'student:option:2026-11': { status: 'paid' } }; const paid = s.render(); assert.equal(paid.getStudentBillingState(item), 'paid'); assert.equal(paid.visibleBillingTargetStudents.length, 0); assert.equal(paid.selectedBillingTargets.length, 0); assert.equal(paid.billingSummary.billed, 1);
  s.deps.selectedMonth = '2026-12'; const next = s.render(); assert.equal(next.getStudentBillingState(item), 'pending'); assert.equal(next.selectedBillingTargets.length, 1);
});
test('cancelled invoice remains selectable and mismatched/renewed package remains locked', () => {
  const s = calculations(); s.deps.targetBillStatuses = { 'student:option:2026-11': { status: 'cancelled' } }; const calc = s.render(); assert.equal(calc.isSelectableBillingTarget(target), true); assert.equal(calc.isSelectableBillingTarget({ ...target, entitlementMismatch: true }), false); assert.equal(calc.isSelectableBillingTarget({ ...target, hasTargetMonthPackage: true }), false);
});
test('student roster callback stays stable, branch changes read once with fresh scope', () => {
  const calls = []; const hooks = runtime(); const deps = { activeBranchId: 'a', loadSequence: { current: 0 }, currentBillMonth: () => '2026-11', supabase: {}, loadActiveAppSchedulesByChild() {}, loadStudentData: async (branch, month) => { calls.push([branch, month]); return { classes: [], packageOptions: [], unregisteredMembers: [], students: [] }; }, setLoading() {}, setClasses() {}, setPackageOptions() {}, setUnregisteredMembers() {}, setStudents() {}, handleError: async () => {} };
  const effect = student.effects.find(s => s.includes('loadSequence.current += 1'));
  const render = compile(student, ['loadData'], effect, deps, hooks); const first = render(); assert.equal(render().loadData, first.loadData); assert.deepEqual(calls, [['a', '2026-11']]);
  deps.activeBranchId = 'b'; assert.notEqual(render().loadData, first.loadData); assert.deepEqual(calls.at(-1), ['b', '2026-11']);
});
test('dependency wiring contains no network/write functions in billing selection effect', () => {
  const selection = billing.effects.find(s => s.includes('billingTargets.filter(isSelectableBillingTarget)')); assert.match(selection, /\[billingTargets, isSelectableBillingTarget\]/); assert.doesNotMatch(selection, /loadBill|save|rpc|supabase/);
});
