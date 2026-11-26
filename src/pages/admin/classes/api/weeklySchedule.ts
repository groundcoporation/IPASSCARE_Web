import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { activeScheduleReservations, assembleWeeklySchedule, type ReservationRow, type ScheduleRow } from '../model/weeklySchedule.ts';

function validDate(value: string) {
  const time = Date.parse(value + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
/** Existing read filters retained. Complete responses required, not a transactional DB snapshot. */
export async function loadWeeklySchedule(branchId: string | null, from: string, to: string, { client }: { client: Pick<SupabaseClient, 'from'> }) {
  try {
    if ((branchId !== null && (!branchId || branchId === 'all')) || !validDate(from) || !validDate(to)
      || Date.parse(to) - Date.parse(from) !== 6 * 86400000) throw new AppError('INPUT_INVALID');
    let scheduleQuery = client.from('class_schedules').select('id,branch_id,target_class,day_of_week,start_time,end_time,max_people,branches(name)').eq('is_active', true).order('start_time');
    let reservationQuery = client.from('reservations').select('id,schedule_id,class_date,status,attendance_status,branch_id,child_id,user_id').is('deleted_at', null).gte('class_date', from).lte('class_date', to);
    if (branchId) { scheduleQuery = scheduleQuery.eq('branch_id', branchId); reservationQuery = reservationQuery.eq('branch_id', branchId); }
    const [schedules, reservations] = await Promise.all([scheduleQuery, reservationQuery]);
    for (const result of [schedules, reservations]) {
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new AppError('SCHEDULE_LOAD_FAILED');
    }
    const active = activeScheduleReservations(reservations.data as ReservationRow[]);
    const childIds = [...new Set(active.map(item => item.child_id).filter((id): id is string => Boolean(id)))];
    const userIds = [...new Set(active.map(item => item.user_id).filter((id): id is string => Boolean(id)))];
    const empty = { data: [], error: null };
    const [children, parents] = await Promise.all([
      childIds.length ? client.from('children').select('id,child_name').in('id', childIds).is('deleted_at', null) : empty,
      userIds.length ? client.from('users').select('id,name,phone').in('id', userIds).neq('status', 'deleted') : empty,
    ]);
    for (const result of [children, parents]) {
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new AppError('SCHEDULE_LOAD_FAILED');
    }
    return assembleWeeklySchedule(schedules.data as ScheduleRow[], active, children.data ?? [], parents.data ?? []);
  } catch (error: unknown) { throw normalizeError(error, 'SCHEDULE_LOAD_FAILED'); }
}
