import { firstJoined } from '../../../../utils/relations.ts';

export type ClassSchedule = { id: string; branch_id: string | null; target_class: string; day_of_week: string; start_time: string; end_time: string; max_people: number | null; branches: { name: string } | null };
export type ScheduleRow = Omit<ClassSchedule, 'branches'> & { branches: { name: string } | { name: string }[] | null };
export type ReservationRow = { id: string; schedule_id: string; class_date: string; status: string | null; attendance_status: string | null; branch_id?: string | null; child_id: string | null; user_id: string | null };
export type ScheduleReservation = ReservationRow & { children: { child_name: string | null } | null; users: { name: string | null; phone: string | null } | null };
export type ScheduleChild = { id: string; child_name: string | null };
export type ScheduleParent = { id: string; name: string | null; phone: string | null };

const cancelledStatuses = new Set(['cancelled', 'canceled', '취소', '취소요청', 'cancel_requested']);
export const activeScheduleReservations = (rows: ReservationRow[]) => rows.filter(row => !cancelledStatuses.has(row.status ?? ''));

/** Keep existing visibility rules: missing linked/deleted people hide their reservation. */
export function assembleWeeklySchedule(schedules: ScheduleRow[], activeReservations: ReservationRow[], children: ScheduleChild[], parents: ScheduleParent[]) {
  const childNames = new Map(children.map(item => [item.id, { child_name: item.child_name }]));
  const parentProfiles = new Map(parents.map(item => [item.id, { name: item.name, phone: item.phone }]));
  return {
    schedules: schedules.map(item => ({ ...item, branches: firstJoined(item.branches) })),
    reservations: activeReservations.filter(item => (!item.child_id || childNames.has(item.child_id)) && (!item.user_id || parentProfiles.has(item.user_id)))
      .map(item => ({ ...item, children: childNames.get(item.child_id ?? '') ?? null, users: parentProfiles.get(item.user_id ?? '') ?? null })),
  };
}
