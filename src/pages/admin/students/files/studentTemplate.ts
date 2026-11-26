import ExcelJS from 'exceljs';

export const studentTemplateHeaders = [
  '클래스명 (선택 - 예: 초등축구반)', '이름 (필수)', '보호자 이름 (선택)', '출결번호 (필수)',
  '어머니 연락처', '아버지 연락처', '학생 연락처', '생년월일 (예: 2016-05-12)', '학교명', '학년',
  '입회일 (예: 2026-08-01)', '수강 요금제명 (필수 - 예: 주 2회 패키지)',
  '납부 주기 (선택 - 월 기간제/분기제 등)', '매월 수납일 (선택 - 매월 1일/매월 5일 등)', '비공개 메모',
] as const;

export async function buildStudentTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('원생 등록 양식');
  sheet.getRow(1).values = [...studentTemplateHeaders];
  sheet.columns.forEach(column => { column.width = 25; });
  return workbook.xlsx.writeBuffer();
}
