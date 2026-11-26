import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { importStudents } from '../../../src/pages/admin/students/api/studentImport.ts';
import { prepareStudentImport } from '../../../src/pages/admin/students/model/studentImportPlan.ts';
import { errorMessages } from '../../../src/errors/appError.ts';
const id = '11111111-1111-4111-8111-111111111111';
const optionId = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-3333-4333-8333-333333333333';
const assignmentId = '44444444-4444-4444-8444-444444444444';
const student = patch => ({ branch_id: 'branch', student_name: '가상 학생', parent_name: null, attendance_code: '0012', mother_phone: null, father_phone: null, student_phone: null, birth_date: null, school_name: null, grade_level: null, address: null, admission_date: '2026-11-25', memo: null, is_sms_enabled: true, ...patch });
const input = patch => ({ branchId: 'branch', students: [student()], mappings: [{ studentIndex: 0, className: '가상 수업', packageName: '주 2회', cycle: '월 기간제', day: '매월 1일' }], classes: [{ id: classId, branch_id: 'branch', target_class: '가상 수업' }], options: [{ id: optionId, branch_id: 'branch', label: '주 2회', packages: { voucher_type: 'lesson' } }], ...patch });
function mock(options = {}) {
  const calls = []; const writes = [];
  const client = { from(table) {
    const context = { table, mode: 'read', filters: [] };
    const query = {};
    for (const name of ['select', 'eq', 'in', 'neq', 'limit', 'single']) query[name] = (...args) => { calls.push([table, name, ...args]); context.filters.push([name, ...args]); return query; };
    query.insert = rows => { context.mode = 'insert'; context.rows = rows; calls.push([table, 'insert', rows]); writes.push([table, rows]); return query; };
    query.then = (resolve, reject) => Promise.resolve().then(() => {
      if (options.reply) { const custom = options.reply(context, writes.length); if (custom instanceof Error) throw custom; if (custom !== undefined) return custom; }
      if (context.mode === 'read') return { data: [] };
      if (table === 'academy_students') return { data: { id } };
      return { data: { id: assignmentId, ...context.rows[0] } };
    }).then(resolve, reject);
    return query;
  } };
  return { calls, writes, client };
}
test('preflight resolves only exact names inside the explicit branch and does not mutate parsed rows', () => {
  const value = input(); const before = structuredClone(value); const result = prepareStudentImport(value.branchId, value.students, value.mappings, value.classes, value.options);
  assert.equal(result[0].assignment.class_schedule_id, classId); assert.equal(result[0].assignment.package_option_id, optionId); assert.deepEqual(value, before);
});
test('preflight rejects missing, foreign, duplicate or GPS options instead of selecting the first', () => {
  for (const options of [[], [{ id: optionId, branch_id: 'other', label: '주 2회' }], [...input().options, ...input().options], [{ ...input().options[0], packages: { voucher_type: 'gps' } }]]) {
    const v = input({ options }); assert.throws(() => prepareStudentImport(v.branchId, v.students, v.mappings, v.classes, v.options), e => e.code === 'STUDENT_IMPORT_INVALID');
  }
});
test('preflight rejects missing/ambiguous classes but keeps optional blank class valid', () => {
  for (const classes of [[], [{ ...input().classes[0], branch_id: 'other' }], [...input().classes, ...input().classes]]) {
    const v = input({ classes }); assert.throws(() => prepareStudentImport(v.branchId, v.students, v.mappings, v.classes, v.options));
  }
  const v = input(); v.mappings[0].className = ''; assert.equal(prepareStudentImport(v.branchId, v.students, v.mappings, v.classes, v.options)[0].assignment.class_schedule_id, null);
});
test('bad branch, mismatched mapping index, duplicate file codes and invalid dates fail before reads', async () => {
  for (const patch of [{ branchId: 'all' }, { students: [student({ branch_id: 'other' })] }, { students: [student({ admission_date: '2026-02-30' })] }, { mappings: [{ ...input().mappings[0], studentIndex: 1 }] }, { students: [student(), student()], mappings: [input().mappings[0], { ...input().mappings[0], studentIndex: 1 }] }]) {
    const d = mock(); await assert.rejects(importStudents(input(patch), d), e => e.code === 'STUDENT_IMPORT_INVALID'); assert.equal(d.calls.length, 0);
  }
});
test('entire file matching finishes before first write even if only a later row is invalid', async () => {
  const v = input(); v.students.push(student({ attendance_code: '0013' })); v.mappings.push({ ...v.mappings[0], studentIndex: 1, packageName: '없는 요금제' });
  const d = mock(); await assert.rejects(importStudents(v, d)); assert.equal(d.writes.length, 0);
});
test('existing attendance code blocks the file before student inserts', async () => {
  const d = mock({ reply: c => c.mode === 'read' && c.table === 'academy_students' ? { data: [{ id }] } : undefined });
  await assert.rejects(importStudents(input(), d), e => e.code === 'STUDENT_IMPORT_DUPLICATE'); assert.equal(d.writes.length, 0);
  assert.ok(d.calls.some(c => c[1] === 'eq' && c[2] === 'branch_id' && c[3] === 'branch'));
});
test('preflight query failures preserve permission guidance and cannot start writes', async () => {
  const d = mock({ reply: c => c.mode === 'read' ? { error: { code: '42501', message: 'private' } } : undefined });
  await assert.rejects(importStudents(input(), d), e => e.code === 'PERMISSION_DENIED' && !e.message.includes('private')); assert.equal(d.writes.length, 0);
});
test('guardian ambiguity or read failure prevents every row from being registered', async () => {
  for (const reply of [{ data: [{ id }, { id: classId }] }, { error: { code: '42501' } }, { data: null }]) {
    const d = mock({ reply: c => c.table === 'users' ? reply : undefined }); await assert.rejects(importStudents(input({ students: [student({ mother_phone: '01000000000' })] }), d)); assert.equal(d.writes.length, 0);
  }
});
test('a unique guardian is linked and deleted accounts are excluded from preflight', async () => {
  const d = mock({ reply: c => c.table === 'users' ? { data: [{ id: classId }] } : undefined });
  const result = await importStudents(input({ students: [student({ mother_phone: '01000000000' })] }), d);
  assert.equal(d.writes[0][1][0].parent_user_id, classId); assert.ok(d.calls.some(c => c[0] === 'users' && c[1] === 'neq' && c[2] === 'status' && c[3] === 'deleted')); assert.equal(result.assigned, 1);
});
test('successful student and assignment writes keep exact IDs, metadata and confirmed counts', async () => {
  const d = mock(); const v = input(); const before = structuredClone(v); const result = await importStudents(v, d);
  assert.deepEqual(result, { created: 1, assigned: 1, notAttempted: 0, reviewRequired: false, errors: [] }); assert.deepEqual(v, before);
  assert.deepEqual(d.writes[1], ['academy_student_classes', [{ student_id: id, class_schedule_id: classId, package_option_id: optionId, billing_cycle: '월 기간제', payment_day: '매월 1일', status: 'active' }]]);
});
test('lost student acknowledgement stops without assignment or retry', async () => {
  for (const reply of [new Error('private network'), { data: null }, { data: { id: 'bad' } }]) {
    const d = mock({ reply: c => c.mode === 'insert' && c.table === 'academy_students' ? reply : undefined });
    const result = await importStudents(input(), d); assert.equal(result.created, 0); assert.equal(result.reviewRequired, true); assert.equal(d.writes.length, 1); assert.equal(result.errors[0].code, 'STUDENT_IMPORT_REVIEW_REQUIRED');
  }
});
test('assignment failure preserves the confirmed student and never rolls back or repeats writes', async () => {
  const d = mock({ reply: c => c.mode === 'insert' && c.table === 'academy_student_classes' ? { error: { code: '42501' } } : undefined });
  const result = await importStudents(input(), d); assert.equal(result.created, 1); assert.equal(result.assigned, 0); assert.equal(result.reviewRequired, true); assert.equal(d.writes.length, 2); assert.equal(result.errors[0].code, 'PERMISSION_DENIED');
});
test('assignment acknowledgements must match the student, package and class', async () => {
  for (const data of [null, { id: assignmentId, student_id: classId }, { id: assignmentId, student_id: id, package_option_id: optionId, class_schedule_id: null }]) {
    const d = mock({ reply: c => c.mode === 'insert' && c.table === 'academy_student_classes' ? { data } : undefined });
    const result = await importStudents(input(), d); assert.equal(result.assigned, 0); assert.equal(result.created, 1); assert.equal(result.reviewRequired, true);
  }
});
test('later failure retains earlier confirmed rows and accurately counts unattempted rows', async () => {
  const v = input(); for (let i = 1; i <= 2; i++) { v.students.push(student({ attendance_code: 'code-' + i })); v.mappings.push({ ...v.mappings[0], studentIndex: i }); }
  const d = mock({ reply: (c, count) => c.mode === 'insert' && count === 3 ? { error: { code: '42501' } } : undefined });
  const result = await importStudents(v, d); assert.equal(result.created, 1); assert.equal(result.assigned, 1); assert.equal(result.notAttempted, 1); assert.equal(d.writes.length, 3);
});
test('view cancellation skips pending rows without abandoning an already-inserted row assignment', async () => {
  const v = input(); v.students.push(student({ attendance_code: 'other' })); v.mappings.push({ ...v.mappings[0], studentIndex: 1 });
  let active = true; const d = mock({ reply: c => { if (c.mode === 'insert') active = false; } });
  const result = await importStudents(v, { ...d, isCurrent: () => active }); assert.equal(result.created, 1); assert.equal(result.assigned, 1); assert.equal(result.notAttempted, 1); assert.equal(d.writes.length, 2);
});
test('cancelling before writes never inserts after preflight', async () => {
  const d = mock(); const result = await importStudents(input(), { ...d, isCurrent: () => false }); assert.equal(result.notAttempted, 1); assert.equal(d.writes.length, 0);
});
test('duplicate preflight checks are batched with existence-only queries', async () => {
  const v = input(); v.students = Array.from({ length: 101 }, (_, i) => student({ attendance_code: 'code' + i })); v.mappings = v.students.map((_, i) => ({ ...input().mappings[0], studentIndex: i }));
  const d = mock(); await importStudents(v, { ...d, isCurrent: () => false });
  assert.deepEqual(d.calls.filter(c => c[1] === 'in' && c[2] === 'attendance_code').map(c => c[3].length), [100, 1]);
});
const app = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('new preflight messages match the app catalog', { skip: !existsSync(app) }, () => {
  const text = readFileSync(app, 'utf8'); for (const code of ['STUDENT_IMPORT_INVALID', 'STUDENT_IMPORT_DUPLICATE']) assert.equal(text.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
