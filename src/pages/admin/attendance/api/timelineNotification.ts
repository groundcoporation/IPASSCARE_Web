import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError, normalizeAsyncError } from '../../../../errors/appError.ts';
import type { AttendanceNotificationAction } from '../model/timelineActions';
/** Notify once after storage only; a failed push does not undo the attendance write. */
export async function notifyTimelineAttendance(childId: string, branchId: string, serviceDate: string, action: AttendanceNotificationAction, { client }: { client: Pick<SupabaseClient, 'functions'> }) {
  try {
    const { data, error } = await client.functions.invoke('send-attendance-notification', {
      body: { child_id: childId, branch_id: branchId, service_date: serviceDate, action },
    });
    if (error) throw await normalizeAsyncError(error, 'ATT_NOTIFICATION_FAILED');
    if (data?.success !== true || !(data.skipped === true || (data.stored === true && typeof data.pushed === 'boolean'))) throw new AppError('ATT_NOTIFICATION_FAILED');
    return { skipped: data.skipped === true, stored: data.stored === true, pushed: data.pushed === true };
  } catch (error: unknown) { throw normalizeError(error, 'ATT_NOTIFICATION_FAILED'); }
}
