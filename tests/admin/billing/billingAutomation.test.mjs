import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { saveBillingAutomation, saveBillingAutomationTargets } from '../../../src/pages/admin/billing/api/billingAutomation.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';

function fixture({ authError = null, noUser = false, writeError = null, rejectWrite = false, acknowledgement } = {}) {
  const calls = []; let authCalls = 0;
  const client = {
    auth: { getUser: async () => { authCalls++; return { data: { user: noUser ? null : { id: 'actor' } }, error: authError }; } },
    from(table) {
      const call = { table }; calls.push(call);
      const query = {
        upsert(payload, config) { call.payload = payload; call.config = config; return query; },
        select(columns) { call.columns = columns; return query; },
        single() { call.single = true; return query; },
        then(resolve, reject) {
          if (rejectWrite) return Promise.reject(new Error('private detail')).then(resolve, reject);
          return Promise.resolve({ data: acknowledgement === undefined ? call.payload : acknowledgement, error: writeError }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { client, calls, get authCalls() { return authCalls; }, now: () => new Date('2026-11-25T01:00:00.000Z') };
}

test('setting save preserves the branch upsert, actor, billing day and explicit requested value', async () => {
  const dependencies = fixture();
  await saveBillingAutomation('branch', true, dependencies);
  assert.equal(dependencies.authCalls, 1);
  assert.deepEqual(dependencies.calls, [{ table: 'academy_billing_automation_settings', payload: {
    branch_id: 'branch', is_enabled: true, billing_day: 1, updated_by: 'actor', updated_at: '2026-11-25T01:00:00.000Z',
  }, config: { onConflict: 'branch_id' }, columns: 'branch_id, is_enabled', single: true }]);
});
test('target save uses one deduplicated batch and a consistent actor/time', async () => {
  const dependencies = fixture();
  await saveBillingAutomationTargets('branch', ['a', 'b', 'a'], false, dependencies);
  assert.equal(dependencies.authCalls, 1); assert.equal(dependencies.calls.length, 1);
  assert.deepEqual(dependencies.calls[0].config, { onConflict: 'branch_id,student_id' });
  assert.deepEqual(dependencies.calls[0].payload, ['a', 'b'].map(student_id => ({ branch_id: 'branch', student_id, is_enabled: false, updated_by: 'actor', updated_at: '2026-11-25T01:00:00.000Z' })));
});
const operations = [
  ['setting', dependencies => saveBillingAutomation('branch', true, dependencies)],
  ['targets', dependencies => saveBillingAutomationTargets('branch', ['a', 'b'], true, dependencies)],
];
for (const [name, run] of operations) {
  test(`${name} authentication errors and missing users stop before writes`, async () => {
    for (const dependencies of [fixture({ authError: { status: 401, message: 'private detail' } }), fixture({ noUser: true })]) {
      await assert.rejects(run(dependencies), error => error.code === 'AUTH_REQUIRED' && !error.message.includes('private detail'));
      assert.equal(dependencies.calls.length, 0);
    }
  });
  test(`${name} write denial preserves permission errors without retry`, async () => {
    const dependencies = fixture({ writeError: { code: '42501', message: 'private detail' } });
    await assert.rejects(run(dependencies), error => error.code === 'PERMISSION_DENIED' && !error.message.includes('private detail'));
    assert.equal(dependencies.calls.length, 1);
  });
  test(`${name} lost responses produce an unknown outcome without automatic retry`, async () => {
    const dependencies = fixture({ rejectWrite: true });
    await assert.rejects(run(dependencies), error => error.code === 'BILL_AUTOMATION_SAVE_UNCONFIRMED' && !error.message.includes('private detail'));
    assert.equal(dependencies.calls.length, 1);
  });
}
test('unconfirmed setting acknowledgements do not count as successful saves', async () => {
  for (const acknowledgement of [null, { branch_id: 'other', is_enabled: true }, { branch_id: 'branch', is_enabled: false }]) {
    await assert.rejects(saveBillingAutomation('branch', true, fixture({ acknowledgement })), error => error.code === 'BILL_AUTOMATION_SAVE_UNCONFIRMED');
  }
});
test('partial, wrong-branch and wrong-value target acknowledgements are rejected', async () => {
  for (const acknowledgement of [[], [{ branch_id: 'branch', student_id: 'a', is_enabled: true }], ['a', 'b'].map(student_id => ({ branch_id: 'other', student_id, is_enabled: true })), ['a', 'b'].map(student_id => ({ branch_id: 'branch', student_id, is_enabled: false }))]) {
    await assert.rejects(saveBillingAutomationTargets('branch', ['a', 'b'], true, fixture({ acknowledgement })), error => error.code === 'BILL_AUTOMATION_SAVE_UNCONFIRMED');
  }
});
test('invalid branch/student inputs send no auth or write requests', async () => {
  const dependencies = fixture();
  for (const branch of ['', 'all']) {
    await assert.rejects(saveBillingAutomation(branch, true, dependencies), error => error.code === 'INPUT_INVALID');
    await assert.rejects(saveBillingAutomationTargets(branch, ['a'], true, dependencies), error => error.code === 'INPUT_INVALID');
  }
  for (const ids of [[], ['']]) await assert.rejects(saveBillingAutomationTargets('branch', ids, true, dependencies), error => error.code === 'INPUT_INVALID');
  assert.equal(dependencies.authCalls, 0); assert.equal(dependencies.calls.length, 0);
});

// Run the actual UI callbacks against isolated dependencies; no auth, DB or scheduler connection.
const source = readFileSync(new URL('../../../src/pages/admin/billing/views/AdminBillingTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminBillingTab.tsx', source, ts.ScriptTarget.Latest, true);
const definitions = new Map(); let effect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) definitions.set(node.name.text, node.initializer.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0].getText(ast).includes('automationReadSequence.current')) effect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const names = ['loadAutoBillingSetting', 'saveAutoBillingTargets', 'toggleAutoBilling'];
const code = ts.transpile(names.map(name => `const ${name} = ${definitions.get(name)};`).join('\n') + `\nconst effect = ${effect};`, { target: ts.ScriptTarget.ES2022 });
function screen(options = {}) {
  const originalTargets = new Set(['existing', 'other']);
  const state = { enabled: false, lastRun: null, targets: originalTargets, saving: false, targetSaving: false, writes: [], alerts: [], errors: [] };
  const dependencies = {
    useCallback: fn => fn,
    AppError, supabase: {}, activeBranchId: options.branch === undefined ? 'branch' : options.branch, autoBillingEnabled: false,
    automationReadSequence: { current: 0 }, automationMutationInFlight: { current: false }, automationReadyBranch: { current: options.ready === false ? null : 'branch' },
    loadBillingAutomation: async (...args) => options.read ? await options.read(...args) : { enabled: false, lastRunAt: null, targetStudentIds: ['existing', 'other'] },
    saveBillingAutomation: async (...args) => { state.writes.push(['setting', ...args]); if (options.write) await options.write(...args); },
    saveBillingAutomationTargets: async (...args) => { state.writes.push(['targets', ...args]); if (options.write) await options.write(...args); },
    setAutoBillingEnabled: value => { state.enabled = value; }, setAutoBillingLastRun: value => { state.lastRun = value; },
    setAutoBillingTargetStudentIds: value => { state.targets = typeof value === 'function' ? value(state.targets) : value; },
    setAutoBillingSaving: value => { state.saving = value; }, setAutoBillingTargetSaving: value => { state.targetSaving = value; },
    alert: message => { state.alerts.push(message); }, handleError: async error => { state.errors.push(error); },
  };
  const handlers = new Function(...Object.keys(dependencies), `${code}\nreturn { load: loadAutoBillingSetting, targets: saveAutoBillingTargets, setting: toggleAutoBilling, mount: effect };`)(...Object.values(dependencies));
  return { state, dependencies, originalTargets, ...handlers };
}
for (const kind of ['setting', 'targets']) {
  test(`${kind} duplicate clicks send one mutation and release flags`, async () => {
    let finish;
    const current = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
    const pending = current[kind](['new'], true); await current[kind](['new'], true);
    assert.equal(current.state.writes.length, 1); finish(); await pending;
    assert.equal(current.dependencies.automationMutationInFlight.current, false);
    assert.equal(current.state.saving, false); assert.equal(current.state.targetSaving, false);
  });
  test(`${kind} unready branch state cannot be written`, async () => {
    const current = screen({ ready: false }); await current[kind](['new'], true);
    assert.equal(current.state.writes.length, 0); assert.equal(current.state.errors[0].code, 'BILL_AUTOMATION_NOT_READY');
  });
  test(`${kind} known denial leaves confirmed local values and releases flags`, async () => {
    const current = screen({ write: async () => { throw new AppError('PERMISSION_DENIED'); } });
    await current[kind](['new'], true);
    assert.equal(current.state.enabled, false); assert.equal(current.state.targets, current.originalTargets);
    assert.equal(current.dependencies.automationReadyBranch.current, 'branch'); assert.equal(current.state.alerts.length, 0);
    assert.equal(current.state.errors[0].code, 'PERMISSION_DENIED');
  });
  test(`${kind} unknown outcome blocks another mutation until settings are read again`, async () => {
    const current = screen({ write: async () => { throw new AppError('BILL_AUTOMATION_SAVE_UNCONFIRMED'); } });
    await current[kind](['new'], true); await current[kind](['new'], true);
    assert.equal(current.state.writes.length, 1); assert.equal(current.dependencies.automationReadyBranch.current, null);
    assert.equal(current.state.errors.at(-1).code, 'BILL_AUTOMATION_NOT_READY');
  });
  test(`${kind} responses from a previous branch do not modify current branch state`, async () => {
    let finish;
    const current = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
    const pending = current[kind](['new'], true);
    current.dependencies.automationReadSequence.current++; current.dependencies.automationReadyBranch.current = 'other';
    finish(); await pending;
    assert.equal(current.state.enabled, false); assert.equal(current.state.targets, current.originalTargets);
    assert.equal(current.dependencies.automationReadyBranch.current, 'other'); assert.equal(current.state.alerts.length, 0);
  });
  test(`${kind} an unknown outcome in the old branch does not clear the new branch readiness`, async () => {
    let fail;
    const current = screen({ write: () => new Promise((resolve, reject) => { fail = reject; }) });
    const pending = current[kind](['new'], true);
    current.dependencies.automationReadSequence.current++; current.dependencies.automationReadyBranch.current = 'other';
    fail(new AppError('BILL_AUTOMATION_SAVE_UNCONFIRMED')); await pending;
    assert.equal(current.dependencies.automationReadyBranch.current, 'other');
    assert.equal(current.state.enabled, false); assert.equal(current.state.targets, current.originalTargets);
  });
}
test('settings and target updates share a synchronous lock', async () => {
  let finish;
  const current = screen({ write: () => new Promise(resolve => { finish = resolve; }) });
  const pending = current.targets(['new'], true); await current.setting();
  assert.equal(current.state.writes.length, 1); finish(); await pending;
});
test('target enable/disable preserves unrelated selected students without mutating the old set', async () => {
  const current = screen(); await current.targets(['new'], true); await current.targets(['existing'], false);
  assert.deepEqual([...current.state.targets].sort(), ['new', 'other']);
  assert.deepEqual([...current.originalTargets].sort(), ['existing', 'other']);
});
test('successful toggle retains the original enable announcement and explicit value', async () => {
  const current = screen(); await current.setting();
  assert.equal(current.state.writes[0][2], true); assert.equal(current.state.enabled, true); assert.equal(current.state.alerts.length, 1);
});
test('all/no-branch and empty target selections send no writes', async () => {
  for (const branch of [null, 'all']) {
    const current = screen({ branch }); await current.setting(); await current.targets(['new'], true); assert.equal(current.state.writes.length, 0);
  }
  const current = screen(); await current.targets([], true); assert.equal(current.state.writes.length, 0);
});
test('successful fresh reads permit writes again, failed reads do not', async () => {
  const current = screen({ ready: false }); await current.load(); await current.setting(); assert.equal(current.state.writes.length, 1);
  const failed = screen({ read: async () => { throw new AppError('PERMISSION_DENIED'); } });
  await failed.load(); await failed.setting(); assert.equal(failed.state.writes.length, 0);
});
test('effect cleanup invalidates old mutations and read readiness on branch change/unmount', async () => {
  const current = screen(); const cleanup = current.mount(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(current.dependencies.automationReadyBranch.current, 'branch'); cleanup();
  assert.equal(current.dependencies.automationReadyBranch.current, null);
});
const appCatalog = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('automation error messages are synchronized with app copies', { skip: !existsSync(appCatalog) }, () => {
  const app = readFileSync(appCatalog, 'utf8');
  for (const key of ['BILL_AUTOMATION_NOT_READY', 'BILL_AUTOMATION_SAVE_UNCONFIRMED']) assert.equal(app.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1], errorMessages[key]);
});
