import ExcelJS from 'exceljs';
import type { StudyLog } from '../api/studyData';
import { studyExportRows, type StudyExportStudent } from '../model/studyExport.ts';

export async function buildStudyWorkbook(logs: StudyLog[], students: StudyExportStudent[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('원생별 학습일지', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: '원생', key: 'student', width: 16 }, { header: '수업일자', key: 'date', width: 14 },
    { header: '클래스', key: 'className', width: 18 }, { header: '담당선생님', key: 'teacher', width: 14 },
    { header: '제목', key: 'title', width: 28 }, { header: '학습 내용', key: 'content', width: 45 },
    { header: '숙제', key: 'homework', width: 30 }, { header: '특이사항', key: 'note', width: 30 },
    { header: '학부모 공개', key: 'visible', width: 14 },
  ];
  sheet.addRows(studyExportRows(logs, students));
  for (const key of ['content', 'homework', 'note']) sheet.getColumn(key).alignment = { wrapText: true, vertical: 'top' };
  return workbook.xlsx.writeBuffer();
}
