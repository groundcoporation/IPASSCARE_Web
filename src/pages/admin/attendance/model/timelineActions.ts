export type AttendanceNotificationAction = 'ride_in' | 'check_in' | 'check_out' | 'ride_out';
export type TimelineAttendanceAction = AttendanceNotificationAction
  | 'no_pickup'
  | 'no_dropoff'
  | 'no_shuttle'
  | 'is_absent'
  | 'reset'
  | 'cancel_ride_in'
  | 'cancel_check_in'
  | 'cancel_check_out'
  | 'cancel_ride_out'
  | 'cancel_absent';
export type BatchAttendanceAction = AttendanceNotificationAction | 'is_absent';
export type AttendanceConfirmation =
  | { mode: 'single'; studentId: string; action: TimelineAttendanceAction; sendNotification: boolean }
  | { mode: 'batch'; action: BatchAttendanceAction; targetCount: number; targetIds: string[]; sendNotification: boolean };


export const attendanceNotificationActions = new Set<AttendanceNotificationAction>([
  'ride_in',
  'check_in',
  'check_out',
  'ride_out',
]);
