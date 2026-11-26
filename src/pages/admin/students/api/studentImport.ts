import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { prepareStudentImport } from '../model/studentImportPlan.ts';
import type { ImportedStudentRow, StudentImportMapping } from '../model/studentImport';
import type { ClassSchedule, PackageOption } from '../types';

export interface StudentImportInput {
  branchId: string;
  students: ImportedStudentRow[];
  mappings: StudentImportMapping[];
  classes: ClassSchedule[];
  options: PackageOption[];
}
export interface StudentImportResult {
  created: number;
  assigned: number;
  notAttempted: number;
  reviewRequired: boolean;
  errors: AppError[];
}
const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Preflight reads first; per-row writes are not a file-wide transaction. Never auto-retry. */
export async function importStudents(input: StudentImportInput, { client, isCurrent = () => true }: {
  client: Pick<SupabaseClient, 'from'>;
  isCurrent?: () => boolean;
}): Promise<StudentImportResult> {
  const result: StudentImportResult = { created: 0, assigned: 0, notAttempted: input.students.length, reviewRequired: false, errors: [] };
  let items;
  try {
    items = prepareStudentImport(input.branchId, input.students, input.mappings, input.classes, input.options);
    const codes = items.map(item => item.student.attendance_code);
    for (let offset = 0; offset < codes.length; offset += 100) {
      const { data, error } = await client.from('academy_students').select('id').eq('branch_id', input.branchId)
        .in('attendance_code', codes.slice(offset, offset + 100)).limit(1);
      if (error) throw error;
      if (!Array.isArray(data)) throw new AppError('STUDENT_IMPORT_INVALID');
      if (data.length) throw new AppError('STUDENT_IMPORT_DUPLICATE');
    }
    // Resolve every guardian before starting inserts; never choose arbitrarily between accounts.
    for (const item of items) {
      const phones = [...new Set([item.student.mother_phone, item.student.father_phone].filter((value): value is string => Boolean(value)))];
      item.student.parent_user_id = null;
      if (!phones.length) continue;
      const { data, error } = await client.from('users').select('id').in('phone', phones).neq('status', 'deleted').limit(2);
      if (error) throw error;
      if (!Array.isArray(data) || data.length > 1 || (data.length === 1 && !isUuid(data[0].id))) throw new AppError('STUDENT_IMPORT_INVALID');
      item.student.parent_user_id = data[0]?.id || null;
    }
  } catch (error: unknown) { throw normalizeError(error, 'STUDENT_IMPORT_INVALID'); }
  for (const [index, item] of items.entries()) {
    if (!isCurrent()) break;
    result.notAttempted = items.length - index - 1;
    try {
      const { data, error } = await client.from('academy_students').insert([item.student]).select('id').single();
      if (error) throw error;
      if (!isUuid(data?.id)) throw new AppError('STUDENT_IMPORT_REVIEW_REQUIRED');
      result.created++;
      const { data: assignment, error: assignmentError } = await client.from('academy_student_classes')
        .insert([{ student_id: data.id, ...item.assignment, status: 'active' }])
        .select('id,student_id,package_option_id,class_schedule_id').single();
      if (assignmentError) throw assignmentError;
      if (!isUuid(assignment?.id) || assignment.student_id !== data.id || assignment.package_option_id !== item.assignment.package_option_id
        || assignment.class_schedule_id !== item.assignment.class_schedule_id) throw new AppError('STUDENT_IMPORT_REVIEW_REQUIRED');
      result.assigned++;
    } catch (error: unknown) {
      result.reviewRequired = true;
      result.errors.push(normalizeError(error, 'STUDENT_IMPORT_REVIEW_REQUIRED'));
      break;
    }
  }
  return result;
}
