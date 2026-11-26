import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { rangeOf, isCancelledReservation } from '../model/ledgerRules.ts';
export async function loadCalendarAttendance(branchId: string | null, month: string, { client }: { client: Pick<SupabaseClient, 'from'> }) {
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError('INPUT_INVALID');
    const period = rangeOf(month);
    let logsQuery = client.from('attendance_logs').select('id, child_id, date, status, check_in, check_out, branch_id')
      .gte('date', period.from).lte('date', period.to);
    let reservationsQuery = client.from('reservations').select('child_id,class_date,status,attendance_status')
      .is('deleted_at', null).gte('class_date', period.from).lte('class_date', period.to);
    if (branchId) {
      logsQuery = logsQuery.eq('branch_id', branchId);
      reservationsQuery = reservationsQuery.eq('branch_id', branchId);
    }
    const [logs, reservations] = await Promise.all([logsQuery, reservationsQuery]);
    if (logs.error) throw logs.error;
    if (reservations.error) throw reservations.error;
    return { logs: logs.data || [], reservations: (reservations.data || []).filter(row => !isCancelledReservation(row.status)) };
  } catch (error: unknown) { throw normalizeError(error, 'ATTENDANCE_CALENDAR_LOAD_FAILED'); }
}
