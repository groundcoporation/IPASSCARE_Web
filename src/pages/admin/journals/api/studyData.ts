import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveAppSchedule } from '../../../../lib/adminScheduleAssignments';
import { normalizeError } from '../../../../errors/appError.ts';

export interface StudyLog {
  id: string;
  branch_id: string | null;
  student_id: string | null;
  class_schedule_id: string | null;
  class_name: string;
  teacher_name: string;
  lesson_date: string;
  title: string;
  content: string;
  homework: string | null;
  special_note: string | null;
  created_at: string;
  updated_at?: string;
  is_parent_visible?: boolean;
}

export interface StudyTeacher {
  id: string;
  name: string;
}

interface Dependencies {
  client: Pick<SupabaseClient, 'from'>;
  loadSchedules: (childIds: string[]) => Promise<Map<string, ActiveAppSchedule[]>>;
}

/** Read-only snapshot. Keep legacy class-wide logs and manual student schedules. */
export async function loadStudyData(branchId: string | null, { client, loadSchedules }: Dependencies) {
  try {
    let studentQuery = client.from('academy_students').select(`
      id, child_id, student_name, parent_name, attendance_code, branch_id,
      academy_student_classes(class_schedules(id, target_class, day_of_week, start_time, end_time))
    `).order('student_name');
    let teacherQuery = client.from('academy_teachers').select('id, name').order('name');
    let logQuery = client.from('academy_study_logs').select('*')
      .order('lesson_date', { ascending: false }).order('created_at', { ascending: false });
    if (branchId) {
      studentQuery = studentQuery.eq('branch_id', branchId);
      teacherQuery = teacherQuery.eq('branch_id', branchId);
      logQuery = logQuery.eq('branch_id', branchId);
    }
    const [studentResult, teacherResult, logResult] = await Promise.all([studentQuery, teacherQuery, logQuery]);
    if (studentResult.error) throw studentResult.error;
    if (teacherResult.error) throw teacherResult.error;
    if (logResult.error) throw logResult.error;

    const rawStudents = studentResult.data || [];
    const schedules = await loadSchedules(rawStudents.map(student => student.child_id).filter(Boolean));
    const students = rawStudents.map(student => ({
      ...student,
      app_schedule_classes: student.child_id ? schedules.get(student.child_id) || [] : undefined,
    }));
    return {
      students,
      teachers: (teacherResult.data || []) as StudyTeacher[],
      logs: (logResult.data || []) as StudyLog[],
    };
  } catch (error: unknown) {
    throw normalizeError(error, 'JOURNAL_LOAD_FAILED');
  }
}
