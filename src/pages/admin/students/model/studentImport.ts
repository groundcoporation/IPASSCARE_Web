export interface ImportedStudentRow {
  branch_id: string;
  student_name: string;
  parent_name: string | null;
  attendance_code: string;
  mother_phone: string | null;
  father_phone: string | null;
  student_phone: string | null;
  birth_date: string | null;
  school_name: string | null;
  grade_level: string | null;
  address: null;
  admission_date: string;
  memo: string | null;
  is_sms_enabled: true;
  parent_user_id?: string | null;
}
export interface StudentImportMapping {
  studentIndex: number;
  className: string;
  packageName: string;
  cycle: string;
  day: string;
}
/** Preserve the existing positional import rules; this is not a new validation policy. */
export function convertStudentImportRows(rows: string[][], branchId: string, today: string) {
  const importedStudents: ImportedStudentRow[] = [];
  const mappingRequests: StudentImportMapping[] = [];
  const legacyDate = (raw: string, fallback: string | null) => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    return raw.includes('-') ? raw : fallback;
  };
  for (const row of rows) {
    const [className, name, parentName, code, mother, father, phone, birth, school, grade, admission, packageName, cycle, day, memo] =
      Array.from({ length: 15 }, (_, index) => (row[index] || '').trim());
    if (!name || !code) continue;
    importedStudents.push({
      branch_id: branchId, student_name: name, parent_name: parentName || null, attendance_code: code,
      mother_phone: mother.replace(/[^0-9]/g, '') || null, father_phone: father.replace(/[^0-9]/g, '') || null,
      student_phone: phone.replace(/[^0-9]/g, '') || null, birth_date: legacyDate(birth, null),
      school_name: school || null, grade_level: grade || null, address: null,
      admission_date: legacyDate(admission, today) || today, memo: memo || null, is_sms_enabled: true,
    });
    mappingRequests.push({ studentIndex: importedStudents.length - 1, className, packageName, cycle: cycle || '월 기간제', day: day || '매월 1일' });
  }
  return { importedStudents, mappingRequests };
}
