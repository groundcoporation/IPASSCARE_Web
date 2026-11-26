import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import { convertStudentImportRows } from '../../../src/pages/admin/students/model/studentImport.ts';
import { readStudentImport } from '../../../src/pages/admin/students/files/studentImport.ts';
import { studentTemplateHeaders } from '../../../src/pages/admin/students/files/studentTemplate.ts';
import { AppError, errorMessages } from '../../../src/errors/appError.ts';

const today = '2026-11-25';
const cells = patch => Object.assign([' 가상 수업 ', ' 가상 학생 ', ' 가상 보호자 ', ' 0012 ', '010-0000-0000', '010 0000 0001', '010.0000.0002', '20160512', ' 가상학교 ', ' 3 ', '20260801', ' 주 2회 ', ' 월 기간제 ', ' 매월 5일 ', ' 내부 메모 '], patch);
test('15 positional columns preserve trim, phone digits, leading-zero code and mapping defaults', () => {
  const result = convertStudentImportRows([cells()], 'branch', today);
  assert.deepEqual(result.importedStudents[0], { branch_id: 'branch', student_name: '가상 학생', parent_name: '가상 보호자', attendance_code: '0012', mother_phone: '01000000000', father_phone: '01000000001', student_phone: '01000000002', birth_date: '2016-05-12', school_name: '가상학교', grade_level: '3', address: null, admission_date: '2026-08-01', memo: '내부 메모', is_sms_enabled: true });
  assert.deepEqual(result.mappingRequests, [{ studentIndex: 0, className: '가상 수업', packageName: '주 2회', cycle: '월 기간제', day: '매월 5일' }]);
});
test('missing name/code rows are skipped and mappings keep compact student indexes', () => {
  const result = convertStudentImportRows([cells({ 1: '' }), cells(), cells({ 3: '' }), cells({ 1: '둘째' })], 'branch', today);
  assert.equal(result.importedStudents.length, 2); assert.deepEqual(result.mappingRequests.map(r => r.studentIndex), [0, 1]);
});
test('optional empty values, admission fallback and cycle/day defaults are preserved', () => {
  const result = convertStudentImportRows([['', '가상 학생', '', '0001']], 'branch', today);
  const row = result.importedStudents[0]; assert.equal(row.parent_name, null); assert.equal(row.mother_phone, null); assert.equal(row.birth_date, null); assert.equal(row.admission_date, today); assert.equal(row.memo, null);
  assert.deepEqual(result.mappingRequests[0], { studentIndex: 0, className: '', packageName: '', cycle: '월 기간제', day: '매월 1일' });
});
test('legacy date conversion is retained rather than silently introducing new validation', () => {
  for (const [birth, expected] of [['2016.05.12', '2016-05-12'], ['2016-05-12', '2016-05-12'], ['bad-date', 'bad-date'], ['45000', null], ['20260230', '2026-02-30']]) {
    assert.equal(convertStudentImportRows([cells({ 7: birth })], 'branch', today).importedStudents[0].birth_date, expected);
  }
});
test('conversion does not mutate input, use extra columns, or invent defaults for required name/code', () => {
  const rows = [cells({ 15: 'ignored private field' })]; const before = structuredClone(rows);
  assert.equal(JSON.stringify(convertStudentImportRows(rows, 'branch', today)).includes('ignored private'), false); assert.deepEqual(rows, before);
  assert.deepEqual(convertStudentImportRows([[]], 'branch', today), { importedStudents: [], mappingRequests: [] });
});
async function fileWith(rows, options = {}) {
  const workbook = new ExcelJS.Workbook();
  if (!options.noSheets) { const sheet = workbook.addWorksheet('원생 등록 양식'); sheet.addRow([...studentTemplateHeaders]); for (const row of rows) sheet.addRow(row); }
  if (options.secondSheet) workbook.addWorksheet('무시').addRows([[...studentTemplateHeaders], cells({ 1: '다른 시트' })]);
  const buffer = await workbook.xlsx.writeBuffer(); return { arrayBuffer: async () => new Uint8Array(buffer).buffer };
}
test('reader round-trip uses first worksheet, skips header and reads cell text', async () => {
  const file = await fileWith([cells(), [], cells({ 1: '' })], { secondSheet: true });
  const result = await readStudentImport(file, 'branch', { today: () => today }); assert.equal(result.importedStudents.length, 1); assert.equal(result.importedStudents[0].attendance_code, '0012');
});
test('reader preserves calculated text and numeric cells without executing formulas', async () => {
  const file = await fileWith([cells({ 3: 12, 9: 3, 14: { formula: '1+1', result: 2 } })]);
  const row = (await readStudentImport(file, 'branch', { today: () => today })).importedStudents[0]; assert.equal(row.attendance_code, '12'); assert.equal(row.grade_level, '3'); assert.equal(row.memo, '2');
});
test('header-only workbook produces an empty preview, not sample students', async () => {
  assert.deepEqual(await readStudentImport(await fileWith([]), 'branch'), { importedStudents: [], mappingRequests: [] });
});
test('read failure, invalid bytes and missing sheets are safe read errors', async () => {
  for (const file of [{ arrayBuffer: async () => { throw new Error('private file path'); } }, { arrayBuffer: async () => new ArrayBuffer(3) }, await fileWith([], { noSheets: true })]) {
    await assert.rejects(readStudentImport(file, 'branch'), e => e.code === 'EXCEL_IMPORT_READ_FAILED' && !e.message.includes('private'));
  }
});
const source = readFileSync(new URL('../../../src/pages/admin/students/views/AdminStudentTab.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AdminStudentTab.tsx', source, ts.ScriptTarget.Latest, true); let expression;
function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'handleExcelUpload') expression = n.initializer.getText(ast); ts.forEachChild(n, visit); } visit(ast);
expression = expression.replace(/await import\('[^']+'\)/g, 'await loadImportModule()');
const parsed = () => convertStudentImportRows([cells(), cells({ 1: '둘째', 3: '0013' })], 'branch', today);
function screen(options = {}) {
  const state = { reads: 0, imports: [], errors: [], alerts: [], prompts: 0, loading: false, refreshed: 0 };
  const input = { files: [{}], value: 'file.xlsx' };
  const read = async () => { state.reads++; return options.read ? options.read() : parsed(); };
  const deps = { AppError, activeBranchId: 'branch', branches: [{ id: 'branch', name: '가상 지점' }], saveInFlight: { current: false }, billingMutationInFlight: { current: false }, archiveInFlight: { current: false }, refundInFlight: { current: false }, loadSequence: { current: 1 },
    setExcelLoading: value => { state.loading = value; }, confirm: () => { state.prompts++; return options.confirm !== false; }, alert: value => state.alerts.push(value), handleError: async (error, fallback) => state.errors.push({ error, fallback }),
    loadImportModule: async () => ({ readStudentImport: read }), supabase: {}, classes: [], packageOptions: [],
    importStudents: async (...args) => { state.imports.push(args); return options.import ? options.import(...args) : { created: 2, assigned: 2, notAttempted: 0, reviewRequired: false, errors: [] }; },
    loadData: async () => { state.refreshed++; },
  };
  const code = ts.transpile('const handler = ' + expression + ';', { target: ts.ScriptTarget.ES2022 });
  return { state, input, deps, run: () => new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps))({ target: input }) };
}
test('upload locks before reading and prevents duplicate confirmation/registration', async () => {
  let finish; const s = screen({ read: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(); await s.run();
  assert.equal(s.state.reads, 1); assert.equal(s.state.prompts, 1); finish(parsed()); await pending;
  assert.equal(s.state.imports.length, 1); assert.equal(s.deps.saveInFlight.current, false); assert.equal(s.state.loading, false); assert.equal(s.input.value, '');
});
test('upload forwards the parsed snapshot and an active-view guard to the service', async () => {
  const s = screen(); await s.run(); const [value, deps] = s.state.imports[0];
  assert.equal(value.branchId, 'branch'); assert.equal(value.students.length, 2); assert.equal(value.mappings.length, 2); assert.equal(deps.isCurrent(), true);
  s.deps.loadSequence.current++; assert.equal(deps.isCurrent(), false); assert.equal(s.state.refreshed, 1);
});
test('empty input, rejected confirmation and busy save cause no parsing or imports', async () => {
  for (const configure of [s => { s.input.files = []; }, s => { s.deps.saveInFlight.current = true; }]) { const s = screen(); configure(s); await s.run(); assert.equal(s.state.reads, 0); }
  const s = screen({ confirm: false }); await s.run(); assert.equal(s.state.reads, 0); assert.equal(s.input.value, '');
});
test('all/unselected/unknown branches are blocked rather than choosing the first branch', async () => {
  for (const branch of [null, 'all', 'unknown']) { const s = screen(); s.deps.activeBranchId = branch; await s.run(); assert.equal(s.state.reads, 0); assert.equal(s.state.imports.length, 0); assert.equal(s.state.prompts, 0); }
});
test('empty parsed data and file read failure cannot start imports', async () => {
  for (const read of [async () => ({ importedStudents: [], mappingRequests: [] }), async () => { throw new AppError('EXCEL_IMPORT_READ_FAILED'); }]) {
    const s = screen({ read }); await s.run(); assert.equal(s.state.imports.length, 0); assert.equal(s.state.loading, false); assert.equal(s.input.value, '');
  }
});
test('view change while parsing cancels before the service starts', async () => {
  let finish; const s = screen({ read: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(); await Promise.resolve();
  s.deps.loadSequence.current++; finish(parsed()); await pending; assert.equal(s.state.imports.length, 0);
});
test('partial results show confirmed counts, unattempted rows and safe review guidance', async () => {
  const s = screen({ import: async () => ({ created: 1, assigned: 0, notAttempted: 1, reviewRequired: true, errors: [new AppError('PERMISSION_DENIED')] }) }); await s.run();
  assert.match(s.state.alerts.at(-1), /학생 등록 확인 1명/); assert.match(s.state.alerts.at(-1), /다시 올리지 말고/); assert.equal(s.state.errors[0].fallback, 'STUDENT_IMPORT_REVIEW_REQUIRED'); assert.equal(s.state.refreshed, 1);
});
test('preflight rejection releases the lock without a misleading success alert', async () => {
  const s = screen({ import: async () => { throw new AppError('STUDENT_IMPORT_INVALID'); } }); await s.run();
  assert.equal(s.state.alerts.length, 0); assert.equal(s.state.errors[0].fallback, 'STUDENT_IMPORT_INVALID'); assert.equal(s.deps.saveInFlight.current, false);
});
test('completion after a view switch never reloads the old branch', async () => {
  let finish; const s = screen({ import: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run();
  await Promise.resolve(); await Promise.resolve(); s.deps.loadSequence.current++;
  finish({ created: 1, assigned: 1, notAttempted: 1, reviewRequired: false, errors: [] }); await pending; assert.equal(s.state.refreshed, 0);
});
const app = new URL('../../../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('import error messages match the app catalog', { skip: !existsSync(app) }, () => {
  const text = readFileSync(app, 'utf8'); for (const code of ['EXCEL_IMPORT_READ_FAILED', 'STUDENT_IMPORT_REVIEW_REQUIRED']) assert.equal(text.match(new RegExp(code + ':\\s*"([^"]+)"'))?.[1], errorMessages[code]);
});
