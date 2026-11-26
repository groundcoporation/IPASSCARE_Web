import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import { studyExportRows } from '../src/pages/admin/journals/model/studyExport.ts';
import { buildStudyWorkbook } from '../src/pages/admin/journals/files/studyWorkbook.ts';
import { buildStudentTemplate, studentTemplateHeaders } from '../src/pages/admin/students/files/studentTemplate.ts';
import { downloadExcel } from '../src/lib/excelDownload.ts';
import { errorMessages } from '../src/errors/appError.ts';

const log = patch => ({ id: 'journal', student_id: 'student', lesson_date: '2026-11-25', class_name: '가상 수업', teacher_name: '가상 담당자', title: '제목', content: '학습\n내용', homework: null, special_note: null, is_parent_visible: false, ...patch });
test('export rows preserve order, legacy class-wide logs, fallback names and visibility', () => {
  const logs = [log(), log({ student_id: null, is_parent_visible: true }), log({ student_id: 'missing' })]; const students = [{ id: 'student', student_name: '가상 학생' }];
  const before = structuredClone({ logs, students }); const rows = studyExportRows(logs, students);
  assert.deepEqual(rows.map(r => r.student), ['가상 학생', '기존 반 전체', '-']); assert.deepEqual(rows.map(r => r.visible), ['내부용', '공개', '내부용']);
  assert.equal(rows[0].homework, '-'); assert.equal(rows[0].note, '-'); assert.deepEqual({ logs, students }, before);
});
test('Excel row projection excludes undeclared private fields and does not create formulas', () => {
  const [row] = studyExportRows([log({ title: '=1+1', token: 'private-token', phone: 'private-phone' })], []);
  assert.deepEqual(Object.keys(row), ['student', 'date', 'className', 'teacher', 'title', 'content', 'homework', 'note', 'visible']); assert.equal(row.title, '=1+1');
});
async function reopen(buffer) { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer); return workbook; }
test('study workbook round-trip preserves all 9 headers, column widths and frozen header', async () => {
  const workbook = await reopen(await buildStudyWorkbook([log()], [{ id: 'student', student_name: '가상 학생' }]));
  const sheet = workbook.getWorksheet('원생별 학습일지');
  assert.equal(workbook.worksheets.length, 1); assert.equal(sheet.rowCount, 2);
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['원생', '수업일자', '클래스', '담당선생님', '제목', '학습 내용', '숙제', '특이사항', '학부모 공개']);
  assert.deepEqual(sheet.columns.map(c => c.width), [16, 14, 18, 14, 28, 45, 30, 30, 14]); assert.equal(sheet.views[0].state, 'frozen'); assert.equal(sheet.views[0].ySplit, 1);
  assert.equal(sheet.getCell('A2').value, '가상 학생'); assert.equal(sheet.getCell('F2').value, '학습\n내용');
  for (const col of [6, 7, 8]) assert.equal(sheet.getColumn(col).alignment.wrapText, true);
});
test('study exports all supplied logs including internal/legacy rows and keeps text literal', async () => {
  const sheet = (await reopen(await buildStudyWorkbook([log({ title: '=1+1' }), log({ student_id: null })], []))).worksheets[0];
  assert.equal(sheet.rowCount, 3); assert.equal(sheet.getCell('E2').value, '=1+1'); assert.equal(sheet.getCell('I2').value, '내부용'); assert.equal(sheet.getCell('A3').value, '기존 반 전체');
});
test('empty study workbook retains headers without inventing sample records', async () => {
  const sheet = (await reopen(await buildStudyWorkbook([], []))).worksheets[0]; assert.equal(sheet.rowCount, 1);
});
test('student template round-trip preserves the 15 import columns in original order', async () => {
  const sheet = (await reopen(await buildStudentTemplate())).worksheets[0];
  assert.equal(sheet.name, '원생 등록 양식'); assert.equal(sheet.rowCount, 1); assert.deepEqual(sheet.getRow(1).values.slice(1), [...studentTemplateHeaders]);
  assert.equal(studentTemplateHeaders.length, 15); assert.equal(sheet.getCell('D1').value, '출결번호 (필수)'); assert.equal(sheet.getCell('L1').value, '수강 요금제명 (필수 - 예: 주 2회 패키지)'); assert.equal(sheet.getCell('O1').value, '비공개 메모');
  assert.equal(sheet.columns.every(c => c.width === 25), true);
});
function browser(options = {}) {
  const state = { removed: 0, revoked: [], clicked: 0, attached: 0 };
  const anchor = { remove() { state.removed++; }, click() { state.clicked++; if (options.clickError) throw new Error('blocked download'); } };
  const dependencies = { document: { createElement() { if (options.createError) throw new Error('no element'); return anchor; }, body: { appendChild() { state.attached++; if (options.appendError) throw new Error('no body'); } } }, url: { createObjectURL(blob) { state.blob = blob; return 'blob:test'; }, revokeObjectURL(url) { state.revoked.push(url); } } };
  return { state, dependencies, anchor };
}
test('browser delivery preserves filename/MIME and releases temporary resources', () => {
  const b = browser(); downloadExcel(new Uint8Array([1, 2]), '가상.xlsx', b.dependencies);
  assert.equal(b.anchor.download, '가상.xlsx'); assert.equal(b.anchor.href, 'blob:test'); assert.equal(b.state.clicked, 1); assert.equal(b.state.attached, 1); assert.equal(b.state.removed, 1); assert.deepEqual(b.state.revoked, ['blob:test']);
  assert.equal(b.state.blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});
for (const error of ['createError', 'appendError', 'clickError']) test('browser cleanup still revokes URL after ' + error, () => {
  const b = browser({ [error]: true }); assert.throws(() => downloadExcel(new Uint8Array([1]), '가상.xlsx', b.dependencies)); assert.deepEqual(b.state.revoked, ['blob:test']);
});
function handler(path, name) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8'); const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true); let expression;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) expression = n.initializer.getText(ast); ts.forEachChild(n, visit); } visit(ast);
  // Replace only the module-loader boundary; the real workbook builders are tested above.
  return expression.replace(/await import\('[^']+'\)/g, 'await loadWorkbookModule()');
}
for (const [name, path, ref, expected] of [
  ['exportExcel', '../src/pages/admin/journals/views/AdminStudyTab.tsx', 'exportInFlight', '원생별_학습일지_2026-11-25.xlsx'],
  ['downloadTemplate', '../src/pages/admin/students/views/AdminStudentTab.tsx', 'templateInFlight', '아이패스케어_원생일괄등록_양식.xlsx'],
]) {
  const expression = handler(path, name);
  function screen(options = {}) {
    const state = { builds: 0, downloads: [], errors: [] };
    const build = async () => { state.builds++; return options.build ? options.build() : new Uint8Array([1]); };
    const deps = { [ref]: { current: false }, logs: [log()], students: [], today: () => '2026-11-25', loadWorkbookModule: async () => ({ buildStudyWorkbook: build, buildStudentTemplate: build }),
      downloadExcel: (...args) => { if (options.downloadError) throw new Error('private'); state.downloads.push(args); }, handleError: async (error, fallback) => state.errors.push({ error, fallback }) };
    const code = ts.transpile('const handler = ' + expression + ';', { target: ts.ScriptTarget.ES2022 });
    return { state, deps, run: new Function(...Object.keys(deps), code + '\nreturn handler;')(...Object.values(deps)) };
  }
  test(name + ' preserves the filename and blocks duplicate builds', async () => {
    let finish; const s = screen({ build: () => new Promise(resolve => { finish = resolve; }) }); const pending = s.run(); await s.run(); assert.equal(s.state.builds, 1);
    finish(new Uint8Array([1])); await pending; assert.equal(s.state.downloads[0][1], expected); assert.equal(s.deps[ref].current, false);
  });
  test(name + ' reports build/download errors through the common handler and releases its lock', async () => {
    for (const options of [{ build: async () => { throw new Error('private'); } }, { downloadError: true }]) {
      const s = screen(options); await s.run(); assert.equal(s.state.errors[0].fallback, 'EXCEL_EXPORT_FAILED'); assert.equal(s.deps[ref].current, false);
    }
  });
}
const app = new URL('../../../IPASSCARE/app/src/errors/appError.ts', import.meta.url);
test('Excel error message matches the app catalog', { skip: !existsSync(app) }, () => {
  assert.equal(readFileSync(app, 'utf8').match(/EXCEL_EXPORT_FAILED:\s*"([^"]+)"/)?.[1], errorMessages.EXCEL_EXPORT_FAILED);
});
