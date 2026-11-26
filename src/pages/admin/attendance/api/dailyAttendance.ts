import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveAppSchedule } from '../../../../lib/adminScheduleAssignments';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { buildDailyAttendance, filterDailyStudents, type DailyStudent } from '../model/dailyAttendance.ts';
/** All daily reads must succeed before publishing any part of the snapshot. */
export async function loadDailyAttendance(branchId: string | null, selectedAttendanceDate: string, { client: supabase, loadSchedules }: {
  client: Pick<SupabaseClient, 'from'>;
  loadSchedules: (ids: string[]) => Promise<Map<string, ActiveAppSchedule[]>>;
}) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedAttendanceDate) || !Number.isFinite(Date.parse(selectedAttendanceDate + 'T00:00:00Z'))
      || new Date(selectedAttendanceDate + 'T00:00:00Z').toISOString().slice(0, 10) !== selectedAttendanceDate) throw new AppError('INPUT_INVALID');
    let query = supabase.from("academy_students").select(`
      id,
      child_id,
      parent_user_id,
      student_name,
      parent_name,
      attendance_code,
      mother_phone,
      father_phone,
      branch_id,
      child:children(deleted_at),
      parent_user:users(status),
      academy_student_classes(
        class_schedules(id, target_class, day_of_week, start_time, end_time)
      )
    `).is("archived_at", null).order("student_name");

    const selectedBranch = branchId;
    if (selectedBranch) query = query.eq("branch_id", selectedBranch);

    const { data: studentsData, error: studentsError } = await query;
    if (studentsError) throw studentsError;

    const rawStudentsWithHistory = filterDailyStudents((studentsData || []) as DailyStudent[]);
    const schedulesByChild = await loadSchedules(rawStudentsWithHistory.map(student => student.child_id).filter((id): id is string => Boolean(id)));
    let logsQuery = supabase.from("attendance_logs")
      .select("id, child_id, date, status, check_in, check_out, shuttle_ride_time, shuttle_drop_time, branch_id")
      .eq("date", selectedAttendanceDate);
    if (selectedBranch) logsQuery = logsQuery.eq("branch_id", selectedBranch);

    const { data: logsData, error: logsError } = await logsQuery;
    if (logsError) throw logsError;

    // Query reservations for today's pickup/dropoff shuttle status
    let resQuery = supabase.from("reservations")
      .select("child_id,schedule_id,status,pickup_shuttle_status,dropoff_shuttle_status,attendance_status,class_schedules(id,target_class,start_time,end_time)")
      .is("deleted_at", null)
      .eq("class_date", selectedAttendanceDate);
    if (selectedBranch) resQuery = resQuery.eq("branch_id", selectedBranch);
    const { data: resData, error: reservationsError } = await resQuery;
    if (reservationsError) throw reservationsError;

    return buildDailyAttendance((studentsData || []) as DailyStudent[], logsData || [], resData || [], schedulesByChild);
  } catch (error: unknown) { throw normalizeError(error, 'ATTENDANCE_DAILY_LOAD_FAILED'); }
}
