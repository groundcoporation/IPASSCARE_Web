import type { ClassSchedule, ScheduleReservation } from './weeklySchedule.ts';
export const scheduleDays = ['월', '화', '수', '목', '금', '토', '일'];
const dayAliases: Record<string, string> = { 월요일: '월', 화요일: '화', 수요일: '수', 목요일: '목', 금요일: '금', 토요일: '토', 일요일: '일', Monday: '월', Tuesday: '화', Wednesday: '수', Thursday: '목', Friday: '금', Saturday: '토', Sunday: '일' };
export const normalizedScheduleDay = (day: string) => dayAliases[day] ?? day.slice(0, 1);
export const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const scheduleLocalDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function scheduleHours(schedules: ClassSchedule[]) {
  const startHour = schedules.length ? Math.max(0, Math.floor(Math.min(...schedules.map(item => minuteOf(item.start_time))) / 60)) : 6;
  const endHour = schedules.length ? Math.min(24, Math.ceil(Math.max(...schedules.map(item => minuteOf(item.end_time))) / 60)) : 22;
  return { startHour, endHour, hourHeight: 72, calendarHeight: Math.max(8, endHour - startHour) * 72 };
}
export function filterWeeklySchedules(schedules: ClassSchedule[], search: string) {
  return schedules.filter(item => `${item.target_class} ${item.branches?.name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
}
export interface ScheduleSelection {
  schedule: ClassSchedule; date: string; reservations: ScheduleReservation[];
  sourceSchedules: ClassSchedule[]; sourceReservations: ScheduleReservation[]; weekKey: string;
}
/** Never show a captured list of people after source data or the visible week changes. */
export function currentScheduleSelection(selection: ScheduleSelection | null, schedules: ClassSchedule[], reservations: ScheduleReservation[], weekKey: string, loading: boolean) {
  return !loading && selection?.sourceSchedules === schedules && selection.sourceReservations === reservations && selection.weekKey === weekKey ? selection : null;
}
