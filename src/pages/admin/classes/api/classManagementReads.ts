import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { firstJoined } from '../../../../utils/relations.ts';
export interface ClassTeacher { id: string; name: string | null; branch_id: string | null }
export interface ManagedClassSchedule {
  id: string; branch_id: string | null; target_class: string; day_of_week: string; start_time: string; end_time: string;
  max_people: number | null; teacher_id: string | null; academy_teachers?: { name: string } | null;
}
type TeacherRow = { id: string; name: string | null; branch_id: string | null };
type ClassRow = Omit<ManagedClassSchedule, 'academy_teachers'> & { academy_teachers?: { name: string } | { name: string }[] | null };
/** Existing three reads and duplicate-name rules retained; return nothing partial. */
export async function loadClassManagementData(branchId: string | null, { client }: { client: Pick<SupabaseClient, 'from'> }) {
  try {
    if (branchId !== null && (!branchId || branchId === 'all')) throw new AppError('INPUT_INVALID');
    let usersQuery = client.from('users').select('id, name, branch_id').in('role', ['teacher', 'coach', 'director']);
    if (branchId) usersQuery = usersQuery.eq('branch_id', branchId);
    const users = await usersQuery;
    if (users.error) throw users.error;
    if (!Array.isArray(users.data)) throw new AppError('CLASS_MANAGEMENT_LOAD_FAILED');
    let teachersQuery = client.from('academy_teachers').select('id, name, branch_id');
    if (branchId) teachersQuery = teachersQuery.eq('branch_id', branchId);
    const custom = await teachersQuery;
    if (custom.error) throw custom.error;
    if (!Array.isArray(custom.data)) throw new AppError('CLASS_MANAGEMENT_LOAD_FAILED');
    let classesQuery = client.from('class_schedules').select(`id, branch_id, target_class, day_of_week, start_time, end_time, max_people, teacher_id, academy_teachers(name)`);
    if (branchId) classesQuery = classesQuery.eq('branch_id', branchId);
    const classes = await classesQuery;
    if (classes.error) throw classes.error;
    if (!Array.isArray(classes.data)) throw new AppError('CLASS_MANAGEMENT_LOAD_FAILED');
    const seen = new Set<string>(); const teachers: ClassTeacher[] = [];
    (users.data as TeacherRow[]).forEach(row => { seen.add(row.id); teachers.push({ id: row.id, name: row.name || '이름 없음', branch_id: row.branch_id }); });
    (custom.data as TeacherRow[]).forEach(row => {
      if (!seen.has(row.id) && !teachers.some(item => item.name === row.name)) teachers.push({ id: row.id, name: row.name, branch_id: row.branch_id });
    });
    return { teachers, classes: (classes.data as ClassRow[]).map(row => ({ ...row, academy_teachers: firstJoined(row.academy_teachers ?? null) })) };
  } catch (error: unknown) { throw normalizeError(error, 'CLASS_MANAGEMENT_LOAD_FAILED'); }
}
