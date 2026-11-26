import ExcelJS from 'exceljs';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { convertStudentImportRows } from '../model/studentImport.ts';

/** Read the first worksheet as cell text, exactly like the original uploader. No DB access. */
export async function readStudentImport(file: Pick<File, 'arrayBuffer'>, branchId: string, { today = () => new Date().toISOString().slice(0, 10) } = {}) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new AppError('EXCEL_IMPORT_READ_FAILED');
    const rows: string[][] = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      rows.push(Array.from({ length: 15 }, (_, index) => row.getCell(index + 1).text || ''));
    });
    return convertStudentImportRows(rows, branchId, today());
  } catch (error: unknown) { throw normalizeError(error, 'EXCEL_IMPORT_READ_FAILED'); }
}
