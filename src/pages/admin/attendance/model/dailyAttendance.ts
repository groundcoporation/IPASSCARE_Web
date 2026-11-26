import { isCancelledReservation } from './ledgerRules.ts';
import type { ActiveAppSchedule } from '../../../../lib/adminScheduleAssignments';
export interface DailyStudent {
  id: string; child_id?: string | null; parent_user_id?: string | null;
  child?: { deleted_at?: string | null } | null;
  parent_user?: { status?: string | null } | null;
  [key: string]: unknown;
}
export interface DailyLog {
  id: string; child_id: string | null; status?: string | null;
  check_in?: string | null; check_out?: string | null; shuttle_ride_time?: string | null; shuttle_drop_time?: string | null;
}
export interface DailyReservation {
  child_id: string | null; status?: string | null; pickup_shuttle_status?: string | null;
  dropoff_shuttle_status?: string | null; attendance_status?: string | null; [key: string]: unknown;
}
export const filterDailyStudents = (students: DailyStudent[]) => students.filter(student =>
  (!student.parent_user_id || student.parent_user?.status !== 'deleted')
  && (!student.child_id || student.child?.deleted_at == null));
/** Pure mapping. Preserve legacy host-local time formatting and existing shuttle fallback times. */
export function buildDailyAttendance(studentsData: DailyStudent[], logsData: DailyLog[], resData: DailyReservation[], schedulesByChild: Map<string, ActiveAppSchedule[]>) {
  const rawStudentsWithHistory = filterDailyStudents(studentsData || []);
  const studentsWithHistory = rawStudentsWithHistory.map((student: any) => ({
    ...student,
    app_schedule_classes: student.child_id ? schedulesByChild.get(student.child_id) || [] : undefined,
  }));
  const studentsList = studentsWithHistory.filter((student: any) => (
    (!student.child_id || student.child?.deleted_at == null)
    && (!student.parent_user_id || student.parent_user?.status !== 'deleted')
  ));

  const activeReservations = (resData || []).filter(reservation => !isCancelledReservation(reservation.status));
  const formatKSTTime = (isoString?: string | null): string | undefined => {
    if (!isoString) return undefined;
    if (/^\d{2}:\d{2}$/.test(isoString)) return isoString;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return undefined;
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    } catch {
      return undefined;
    }
  };

  const recordsMap: Record<string, { 
    log_id?: string; 
    ride_in?: string; 
    no_pickup?: boolean; 
    check_in?: string; 
    check_out?: string; 
    ride_out?: string; 
    no_dropoff?: boolean; 
    is_absent?: boolean; 
    no_shuttle?: boolean; 
  }> = {};

  (logsData || []).forEach((log: any) => {
    const student = studentsList.find((s: any) => s.child_id === log.child_id || s.id === log.child_id);
    const key = student ? student.id : log.child_id;
    if (!key) return;

    const cur = recordsMap[key] || {};
    const checkInTime = formatKSTTime(log.check_in);
    const checkOutTime = formatKSTTime(log.check_out);
    const rideInTime = formatKSTTime(log.shuttle_ride_time) || (log.status === '승차' || log.status === '셔틀승차' ? checkInTime : undefined);
    const rideOutTime = formatKSTTime(log.shuttle_drop_time) || (log.status === '하차' || log.status === '셔틀하차' ? checkOutTime : undefined);
    const isAbsent = log.status === '결석' || log.status === '사전결석';
    const noShuttle = log.status === '미탑승' || log.status === '셔틀미탑승';

    recordsMap[key] = {
      ...cur,
      log_id: log.id,
      check_in: checkInTime || cur.check_in,
      check_out: checkOutTime || cur.check_out,
      ride_in: rideInTime || cur.ride_in,
      ride_out: rideOutTime || cur.ride_out,
      is_absent: isAbsent || cur.is_absent,
      no_shuttle: noShuttle || cur.no_shuttle,
      no_pickup: noShuttle || cur.no_pickup,
    };
  });

  // Merge reservations status
  activeReservations.forEach((res: any) => {
    const student = studentsList.find((s: any) => s.child_id === res.child_id || s.id === res.child_id);
    const key = student ? student.id : res.child_id;
    if (!key) return;

    const cur = recordsMap[key] || {};
    if (res.pickup_shuttle_status === 'missed') {
      cur.no_pickup = true;
      cur.no_shuttle = true;
      cur.ride_in = undefined;
    } else if (res.pickup_shuttle_status === 'boarded' && !cur.ride_in) {
      cur.ride_in = cur.check_in || '14:00';
      cur.no_pickup = false;
      cur.no_shuttle = false;
    }
    if (res.dropoff_shuttle_status === 'missed') {
      cur.no_dropoff = true;
      cur.ride_out = undefined;
    } else if (res.dropoff_shuttle_status === 'dropped_off' && !cur.ride_out) {
      cur.ride_out = cur.check_out || '16:00';
      cur.no_dropoff = false;
    }
    if (res.attendance_status === '결석') {
      cur.is_absent = true;
    }
    recordsMap[key] = cur;
  });


  return {
    studentsWithHistory, studentsList, activeReservations, recordsMap,
    reservationChildIds: Array.from(new Set(activeReservations.map(reservation => reservation.child_id).filter((id): id is string => Boolean(id)))),
  };
}
