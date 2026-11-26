import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { saveStudentData, requiresStudentSaveReview } from '../../../src/pages/admin/students/api/studentSave.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';

const input = patch => ({
  editingId: null, editingStudent: null, selectedBranchId: 'branch', studentName: ' 가상 원생 ', parentName: '', attendanceCode: ' 1234 ',
  motherPhone: '', fatherPhone: '', studentPhone: '', birthDate: '', schoolName: '', gradeLevel: '', address: '', admissionDate: '', memo: '', isSmsEnabled: true,
  classAssignments: [{ class_schedule_id: 'class', package_option_id: 'option', billing_cycle: '월 기간제', payment_day: '매월 1일' }],
  pickupSpots: [{ id: 'spot', name: '가상 정류장' }], pickupSpotId: 'spot', dropoffSpotId: '', pickupDetailLocation: ' 위치 ', dropoffDetailLocation: '',
  currentMonthClassIds: ['current-class'], currentMonthPackages: [{ package_option_id: 'current-option' }], applyCurrentClassesToNextMonth: true,
  nextEffectiveMonth: '2026-12-01', nextMonthClassIds: ['next-class'], nextMonthPackages: [{ package_option_id: 'next-option' }], currentMonthBillingLocked: false,
  ...patch,
});
const linked = patch => input({ editingId: 'student', editingStudent: { id: 'student', child_id: 'child', parent_user_id: 'fallback-parent', child: { parent_id: 'actual-parent' } }, ...patch });
function fixture({ failAt, rejectAt, error = { code: '42501', message: 'private detail' }, existing = null, noUpdatedRow = false } = {}) {
  const calls = [];
  async function execute(call, data) {
    const index = calls.length; calls.push(call);
    if (index === rejectAt) throw new Error('private network detail');
    return { data, error: index === failAt ? error : null };
  }
  const client = {
    from(table) {
      const call = { table, action: 'read', filters: [], columns: null };
      const query = {
        select(columns) { call.columns = columns; return query; },
        in(column, values) { call.filters.push([column, values]); return query; },
        neq(column, value) { call.filters.push([column, value]); return query; },
        eq(column, value) { call.filters.push([column, value]); return query; },
        limit() { return query; }, maybeSingle() { return query; }, single() { call.single = true; return query; },
        insert(payload) { call.action = 'insert'; call.payload = payload; return query; },
        update(payload) { call.action = 'update'; call.payload = payload; return query; },
        delete() { call.action = 'delete'; return query; },
        upsert(payload, config) { call.action = 'upsert'; call.payload = payload; call.config = config; return query; },
        then(resolve, reject) {
          const id = call.filters.find(([key]) => key === 'id')?.[1];
          const data = table === 'users' ? [{ id: 'matched-parent' }] : table === 'academy_students'
            ? call.action === 'read' ? existing : noUpdatedRow ? null : { id: id || 'new-student' } : null;
          return execute(call, data).then(resolve, reject);
        },
      };
      return query;
    },
    rpc(name, payload) { return execute({ table: name, action: 'rpc', payload }, null); },
  };
  return { client, calls };
}

test('new web students save trimmed basic data before assignments', async () => {
  const dependencies = fixture();
  assert.equal(await saveStudentData(input(), dependencies), 'new-student');
  assert.deepEqual(dependencies.calls.map(call => [call.table, call.action]), [['academy_students', 'insert'], ['academy_student_classes', 'insert']]);
  const payload = dependencies.calls[0].payload[0];
  assert.equal(payload.student_name, '가상 원생');
  assert.equal(payload.attendance_code, '1234');
  assert.equal(payload.parent_user_id, null);
  assert.equal(payload.birth_date, null);
  assert.equal(dependencies.calls[1].payload[0].student_id, 'new-student');
});

test('web edits preserve phone matching and replace class assignments after a confirmed row update', async () => {
  const dependencies = fixture();
  await saveStudentData(input({ editingId: 'student', editingStudent: { id: 'student', child_id: null }, motherPhone: '010-0000-0000' }), dependencies);
  assert.deepEqual(dependencies.calls[0].filters[0], ['phone', ['01000000000']]);
  assert.equal(dependencies.calls[1].payload.parent_user_id, 'matched-parent');
  assert.equal(dependencies.calls[1].single, true);
  assert.deepEqual(dependencies.calls.slice(2).map(call => call.action), ['delete', 'insert']);
});

test('app-linked edits use the child owner and the existing unified RPC without phone lookup', async () => {
  const dependencies = fixture();
  await saveStudentData(linked({ motherPhone: '01000000000', currentMonthBillingLocked: true }), dependencies);
  assert.equal(dependencies.calls.some(call => call.table === 'users'), false);
  assert.equal(dependencies.calls[0].payload.parent_user_id, 'actual-parent');
  assert.equal(dependencies.calls[1].table, 'pickup_settings');
  assert.equal(dependencies.calls[1].payload.detail_location, '위치');
  assert.deepEqual(dependencies.calls[1].config, { onConflict: 'child_id' });
  const rpc = dependencies.calls[2];
  assert.equal(rpc.table, 'save_student_schedule_and_billing_all_months');
  assert.deepEqual(rpc.payload.p_current_schedule_ids, ['current-class']);
  assert.deepEqual(rpc.payload.p_next_package_option_ids, ['next-option']);
  assert.equal(rpc.payload.p_update_current_billing, false);
  assert.equal(rpc.payload.p_next_effective_month, '2026-12-01');
});

for (const existing of [null, { id: 'real-student' }]) {
  test(`virtual app students ${existing ? 'reuse' : 'create'} the real row before planning`, async () => {
    const dependencies = fixture({ existing });
    await saveStudentData(linked({ editingId: 'child-child' }), dependencies);
    assert.equal(dependencies.calls[0].action, 'read');
    assert.equal(dependencies.calls[1].action, existing ? 'update' : 'insert');
    if (!existing) assert.equal(dependencies.calls[1].payload[0].child_id, 'child');
    assert.equal(dependencies.calls.at(-1).payload.p_student_id, existing?.id || 'new-student');
  });
}

test('parent lookup permission errors stop before any write instead of clearing the link', async () => {
  const dependencies = fixture({ failAt: 0 });
  await assert.rejects(saveStudentData(input({ motherPhone: '01000000000' }), dependencies), error => error.code === 'PERMISSION_DENIED');
  assert.equal(dependencies.calls.length, 1);
  assert.equal(dependencies.calls[0].action, 'read');
});
test('base write denial stops before subsequent stages', async () => {
  const dependencies = fixture({ failAt: 0 });
  await assert.rejects(saveStudentData(input(), dependencies), error => error.code === 'PERMISSION_DENIED');
  assert.equal(dependencies.calls.length, 1);
});
test('a lost base insert response is uncertain, not a retryable registration failure', async () => {
  const dependencies = fixture({ rejectAt: 0 });
  await assert.rejects(saveStudentData(input(), dependencies), error => error.code === 'STUDENT_SAVE_UNCONFIRMED' && requiresStudentSaveReview(error));
  assert.equal(dependencies.calls.length, 1);
});
test('an unconfirmed update row does not proceed to assignments', async () => {
  const dependencies = fixture({ noUpdatedRow: true });
  await assert.rejects(saveStudentData(input({ editingId: 'student' }), dependencies), error => error.code === 'STUDENT_SAVE_UNCONFIRMED');
  assert.equal(dependencies.calls.length, 1);
});
for (const failAt of [1, 2]) {
  test(`web assignment failure at stage ${failAt} reports saved basic data without automatic retry`, async () => {
    const dependencies = fixture({ failAt });
    await assert.rejects(saveStudentData(input({ editingId: 'student' }), dependencies), error => error.code === 'STUDENT_CLASSES_SAVE_PARTIAL');
    assert.equal(dependencies.calls.length, failAt + 1);
  });
}
test('pickup failure reports saved basic data and does not invoke billing RPC', async () => {
  const dependencies = fixture({ failAt: 1 });
  await assert.rejects(saveStudentData(linked(), dependencies), error => error.code === 'STUDENT_PICKUP_SAVE_PARTIAL');
  assert.equal(dependencies.calls.length, 2);
});
test('missing RPC reports partial success and never falls back to direct table writes', async () => {
  const dependencies = fixture({ failAt: 2, error: { code: 'PGRST202', message: 'private detail' } });
  await assert.rejects(saveStudentData(linked(), dependencies), error => error.code === 'STUDENT_PLAN_SAVE_PARTIAL' && error.cause.code === 'SERVER_UPDATE_REQUIRED');
  assert.equal(dependencies.calls.length, 3);
  assert.equal(dependencies.calls.at(-1).action, 'rpc');
});
test('a lost RPC response reports partial/unknown plan outcome without repeating the write', async () => {
  const dependencies = fixture({ rejectAt: 2 });
  await assert.rejects(saveStudentData(linked(), dependencies), error => error.code === 'STUDENT_PLAN_SAVE_PARTIAL');
  assert.equal(dependencies.calls.length, 3);
});
const appCatalog = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('new save error messages are synchronized and contain no raw error text', { skip: !existsSync(appCatalog) }, () => {
  const app = readFileSync(appCatalog, 'utf8');
  for (const code of ['STUDENT_SAVE_FAILED', 'STUDENT_SAVE_UNCONFIRMED', 'STUDENT_CLASSES_SAVE_PARTIAL', 'STUDENT_PICKUP_SAVE_PARTIAL', 'STUDENT_PLAN_SAVE_PARTIAL']) {
    assert.equal(app.match(new RegExp(`${code}:\\s*"([^"]+)"`))?.[1], errorMessages[code]);
    assert.equal(new AppError(code, new Error('private detail')).message.includes('private detail'), false);
  }
});

// Execute the real screen handler with state dependencies, not a duplicate implementation.
const source = readFileSync(new URL('../../../src/pages/admin/students/views/AdminStudentTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudentTab.tsx', source, ts.ScriptTarget.Latest, true);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleSave') handler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function screen(save) {
  const state = { loading: false, closes: 0, reads: 0, errors: [] };
  const dependencies = {
    ...input(), saveStudentData: save, requiresStudentSaveReview, students: [], supabase: {},
    saveInFlight: { current: false }, archiveInFlight: { current: false }, billingMutationInFlight: { current: false }, refundInFlight: { current: false }, detailLoadSequence: { current: 1 },
    nextMonthStart: () => '2026-12-01', confirm: () => true, alert() {},
    setSaveLoading: value => { state.loading = value; }, closeStudentModal: () => { state.closes++; }, loadData: async () => { state.reads++; },
    handleError: async error => { state.errors.push(error); },
  };
  const code = ts.transpile(`const handler = ${handler};`, { target: ts.ScriptTarget.ES2022 });
  return { state, dependencies, run: new Function(...Object.keys(dependencies), `${code}\nreturn handler;`)(...Object.values(dependencies)) };
}
const event = { preventDefault() {} };
test('refund writes in progress block student saves before mutation', async () => {
  let calls = 0;
  const { dependencies, run } = screen(async () => { calls++; });
  dependencies.refundInFlight.current = true;
  await run(event);
  assert.equal(calls, 0);
});
test('duplicate save clicks result in one write and release the synchronous guard', async () => {
  let finish; let calls = 0;
  const { state, dependencies, run } = screen(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = run(event); await run(event);
  assert.equal(calls, 1); assert.equal(state.loading, true);
  finish('student'); await first;
  assert.equal(dependencies.saveInFlight.current, false); assert.equal(state.loading, false);
  assert.equal(state.closes, 1); assert.equal(state.reads, 1);
});
test('partial and unconfirmed saves close the stale editor and refresh by reads only', async () => {
  const { state, run } = screen(async () => { throw new AppError('STUDENT_CLASSES_SAVE_PARTIAL'); });
  await run(event);
  assert.equal(state.closes, 1); assert.equal(state.reads, 1); assert.equal(state.errors.length, 1);
  assert.equal(state.loading, false);
});
test('pre-write denial keeps the editor and does not refresh or resubmit', async () => {
  const { state, run } = screen(async () => { throw new AppError('PERMISSION_DENIED'); });
  await run(event);
  assert.equal(state.closes, 0); assert.equal(state.reads, 0); assert.equal(state.errors.length, 1);
});
test('a branch/editor change during save does not close or refresh a different editor', async () => {
  let finish;
  const { state, dependencies, run } = screen(() => new Promise(resolve => { finish = resolve; }));
  const pending = run(event); dependencies.detailLoadSequence.current++;
  finish('student'); await pending;
  assert.equal(state.closes, 0); assert.equal(state.reads, 0); assert.equal(state.loading, false);
});
