import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import type { TimelineAttendanceAction } from '../model/timelineActions';
export interface TimelineRecord {
  log_id?: string; ride_in?: string; check_in?: string; check_out?: string; ride_out?: string;
  no_pickup?: boolean; no_dropoff?: boolean; is_absent?: boolean; no_shuttle?: boolean;
}
export interface TimelineWriteInput {
  childId: string; branchId: string; date: string; action: TimelineAttendanceAction; record: TimelineRecord;
}
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const actions = new Set(['ride_in','check_in','check_out','ride_out','no_pickup','no_dropoff','no_shuttle','is_absent','reset','cancel_ride_in','cancel_check_in','cancel_check_out','cancel_ride_out','cancel_absent']);
/** Existing sequential calls only, not an atomic transaction. Stop on any response error. */
export async function writeTimelineAction(input: TimelineWriteInput, { client: supabase, now = () => new Date().toISOString() }: {
  client: Pick<SupabaseClient, 'from' | 'rpc'>; now?: () => string;
}) {
  let completedSteps = 0;
  try {
    const { childId: targetChildId, branchId: targetBranch, date: selectedAttendanceDate, action: actionType, record } = input;
    if (!isUuid(targetChildId) || !targetBranch || targetBranch === 'all' || !actions.has(actionType)
      || !/^\d{4}-\d{2}-\d{2}$/.test(selectedAttendanceDate)
      || !Number.isFinite(Date.parse(selectedAttendanceDate + 'T00:00:00Z'))
      || new Date(selectedAttendanceDate + 'T00:00:00Z').toISOString().slice(0,10) !== selectedAttendanceDate) throw new AppError('INPUT_INVALID');
    const nowIso = now();
    async function step<T extends { error?: unknown }>(request: PromiseLike<T>): Promise<T> {
      const response = await request;
      if (response.error) throw response.error;
      completedSteps++;
      return response;
    }
      if (actionType === 'reset') {
        await step(supabase.from("attendance_logs").delete().eq("child_id", targetChildId).eq("date", selectedAttendanceDate));
        await step(supabase.from("reservations").update({ pickup_shuttle_status: null, dropoff_shuttle_status: null, attendance_status: '예약' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
      } else if (actionType === 'cancel_ride_in') {
        const reservationResult = await step(supabase.from("reservations").update({ pickup_shuttle_status: null }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        if (reservationResult.error) throw reservationResult.error;
        const logResult = await step(supabase.from("attendance_logs").update({
          shuttle_ride_time: null,
          status: record?.check_in ? '등원' : null,
        }).eq("child_id", targetChildId).eq("date", selectedAttendanceDate));
        if (logResult.error) throw logResult.error;
      } else if (actionType === 'cancel_check_in') {
        await step(supabase.from("reservations").update({ attendance_status: '예약' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        await step(supabase.from("attendance_logs").update({ check_in: null }).eq("child_id", targetChildId).eq("date", selectedAttendanceDate));
      } else if (actionType === 'cancel_check_out') {
        await step(supabase.from("reservations").update({ attendance_status: '등원' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        await step(supabase.from("attendance_logs").update({ check_out: null }).eq("child_id", targetChildId).eq("date", selectedAttendanceDate));
      } else if (actionType === 'cancel_ride_out') {
        const reservationResult = await step(supabase.from("reservations").update({ dropoff_shuttle_status: null }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        if (reservationResult.error) throw reservationResult.error;
        const currentRecord = record;
        const logResult = await step(supabase.from("attendance_logs").update({
          shuttle_drop_time: null,
          status: currentRecord?.check_out ? '하원' : currentRecord?.check_in ? '등원' : null,
        }).eq("child_id", targetChildId).eq("date", selectedAttendanceDate));
        if (logResult.error) throw logResult.error;
      } else if (actionType === 'cancel_absent') {
        await step(supabase.from("reservations").update({ attendance_status: '예약' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        await step(supabase.from("attendance_logs").update({ status: '등원' }).eq("child_id", targetChildId).eq("date", selectedAttendanceDate));
      } else if (actionType === 'no_pickup' || actionType === 'no_shuttle') {
        await step(supabase.from("reservations").update({ pickup_shuttle_status: 'missed' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        await step(supabase.from("shuttle_logs").insert([{ child_id: targetChildId, event_type: '미탑승', event_time: nowIso, branch_id: targetBranch, service_date: selectedAttendanceDate, direction: 'pickup' }]));
      } else if (actionType === 'no_dropoff') {
        await step(supabase.from("reservations").update({ dropoff_shuttle_status: 'missed' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        await step(supabase.from("shuttle_logs").insert([{ child_id: targetChildId, event_type: '미탑승', event_time: nowIso, branch_id: targetBranch, service_date: selectedAttendanceDate, direction: 'dropoff' }]));
      } else {
        const statusMap: Record<string, string> = {
          ride_in: '승차',
          check_in: '등원',
          check_out: '하원',
          ride_out: '하차',
          is_absent: '결석'
        };
        if (actionType === 'check_in' || actionType === 'check_out') {
          const usageResult = await step(supabase.rpc('process_lesson_check_in', {
            p_reservation_id: null,
            p_child_id: targetChildId,
            p_branch_id: targetBranch,
            p_class_date: selectedAttendanceDate,
          }));
          if (usageResult.error) throw usageResult.error;
        }
        const payload: any = {
          child_id: targetChildId,
          date: selectedAttendanceDate,
          branch_id: targetBranch,
          status: statusMap[actionType] || '등원',
        };
        if (actionType === 'ride_in') {
          payload.shuttle_ride_time = nowIso;
          const reservationResult = await step(supabase.from("reservations").update({ pickup_shuttle_status: 'boarded' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
          if (reservationResult.error) throw reservationResult.error;
        } else if (actionType === 'check_in') {
          payload.check_in = nowIso;
          await step(supabase.from("reservations").update({ attendance_status: '등원' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        } else if (actionType === 'check_out') {
          payload.check_out = nowIso;
          await step(supabase.from("reservations").update({ attendance_status: '하원' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        } else if (actionType === 'ride_out') {
          payload.shuttle_drop_time = nowIso;
          const reservationResult = await step(supabase.from("reservations").update({ dropoff_shuttle_status: 'dropped_off' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
          if (reservationResult.error) throw reservationResult.error;
        } else if (actionType === 'is_absent') {
          payload.status = '결석';
          await step(supabase.from("reservations").update({ attendance_status: '결석' }).eq("child_id", targetChildId).eq("class_date", selectedAttendanceDate).is("deleted_at", null));
        }

        const existingResult = await step(supabase.from("attendance_logs").select("id").eq("child_id", targetChildId).eq("date", selectedAttendanceDate).maybeSingle());
        if (existingResult.error) throw existingResult.error;
        const existing = existingResult.data;
        if (existing) {
          const result = await step(supabase.from("attendance_logs").update(payload).eq("id", existing.id));
          if (result.error) throw result.error;
        } else {
          const result = await step(supabase.from("attendance_logs").insert([payload]));
          if (result.error) throw result.error;
        }
      }
    return { completedSteps, issue: null };
  } catch (error: unknown) {
    return { completedSteps, issue: normalizeError(error, 'ATT_TIMELINE_REVIEW_REQUIRED') };
  }
}
