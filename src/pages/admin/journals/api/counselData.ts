import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveAppSchedule } from '../../../../lib/adminScheduleAssignments';
import { normalizeError } from '../../../../errors/appError.ts';

export interface CounselLog {
  id: string;
  branch_id: string | null;
  student_id: string;
  counselor_name: string;
  counsel_date: string;
  category: string;
  content: string;
  created_at: string;
  updated_at?: string;
  is_parent_visible?: boolean;
}

export interface CounselTeacher {
  id: string;
  name: string;
  phone?: string | null;
}

interface Dependencies {
  client: Pick<SupabaseClient, 'from'>;
  loadSchedules: (childIds: string[]) => Promise<Map<string, ActiveAppSchedule[]>>;
}

/** Read-only snapshot. Publish nothing to the UI until all reads succeed. */
export async function loadCounselData(branchId: string | null, { client, loadSchedules }: Dependencies) {
  try {
    let studentsQuery = client.from('academy_students').select(`
      id, child_id, student_name, parent_name, attendance_code,
      mother_phone, father_phone, branch_id,
      academy_student_classes(
        class_schedules(id, target_class, day_of_week, start_time, end_time)
      )
    `).order('student_name');
    if (branchId) studentsQuery = studentsQuery.eq('branch_id', branchId);
    const { data: rawStudents, error: studentsError } = await studentsQuery;
    if (studentsError) throw studentsError;
    const schedules = await loadSchedules((rawStudents || []).map(student => student.child_id).filter(Boolean));
    const students = (rawStudents || []).map(student => ({
      ...student,
      app_schedule_classes: student.child_id ? schedules.get(student.child_id) || [] : undefined,
    }));

    let teachersQuery = client.from('academy_teachers').select('id, name, phone');
    if (branchId) teachersQuery = teachersQuery.eq('branch_id', branchId);
    const { data: teachers, error: teachersError } = await teachersQuery.order('name');
    if (teachersError) throw teachersError;

    let logsQuery = client.from('academy_counsel_logs').select('*')
      .order('counsel_date', { ascending: false }).order('created_at', { ascending: false });
    if (branchId) logsQuery = logsQuery.eq('branch_id', branchId);
    const { data: logs, error: logsError } = await logsQuery;
    if (logsError) throw logsError;
    return { students, teachers: (teachers || []) as CounselTeacher[], counselLogs: (logs || []) as CounselLog[] };
  } catch (error: unknown) {
    throw normalizeError(error, 'JOURNAL_LOAD_FAILED');
  }
}
