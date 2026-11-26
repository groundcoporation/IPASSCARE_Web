import { AppError } from '../../../../errors/appError.ts';
import type { ClassSchedule, PackageOption } from '../types';
import type { ImportedStudentRow, StudentImportMapping } from './studentImport';

export interface StudentImportItem {
  student: ImportedStudentRow;
  assignment: { class_schedule_id: string | null; package_option_id: string; billing_cycle: string; payment_day: string };
}
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Resolve every row before any write. Never substitute the first branch, class or option. */
export function prepareStudentImport(branchId: string, students: ImportedStudentRow[], mappings: StudentImportMapping[], classes: ClassSchedule[], options: PackageOption[]): StudentImportItem[] {
  if (!branchId || branchId === 'all' || !students.length || mappings.length !== students.length) throw new AppError('STUDENT_IMPORT_INVALID');
  const codes = new Set<string>();
  return students.map((student, index) => {
    const mapping = mappings[index];
    if (student.branch_id !== branchId || !student.student_name.trim() || !student.attendance_code.trim()
      || codes.has(student.attendance_code.trim()) || mapping.studentIndex !== index || !validDate(student.admission_date)
      || (student.birth_date !== null && !validDate(student.birth_date))) throw new AppError('STUDENT_IMPORT_INVALID');
    codes.add(student.attendance_code.trim());
    const matchingClasses = classes.filter(item => item.branch_id === branchId && item.target_class.trim() === mapping.className);
    const matchingOptions = options.filter(item => item.branch_id === branchId && item.label.trim() === mapping.packageName && item.packages?.voucher_type !== 'gps');
    if ((mapping.className && (matchingClasses.length !== 1 || !isUuid(matchingClasses[0].id)))
      || !mapping.packageName || matchingOptions.length !== 1 || !isUuid(matchingOptions[0].id)) throw new AppError('STUDENT_IMPORT_INVALID');
    return { student: { ...student, attendance_code: student.attendance_code.trim() }, assignment: {
      class_schedule_id: mapping.className ? matchingClasses[0].id : null, package_option_id: matchingOptions[0].id,
      billing_cycle: mapping.cycle, payment_day: mapping.day,
    } };
  });
}
