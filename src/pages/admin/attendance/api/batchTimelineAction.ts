import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { writeTimelineAction, type TimelineWriteInput } from './timelineAction.ts';
import { notifyTimelineAttendance } from './timelineNotification.ts';
import { attendanceNotificationActions, type AttendanceNotificationAction, type BatchAttendanceAction } from '../model/timelineActions.ts';

export interface BatchTimelineTarget {
  studentId: string;
  childId: string;
  branchId: string;
  record: TimelineWriteInput['record'];
}
export interface BatchTimelineResult {
  studentId: string;
  storage: 'responses_received' | 'review_required' | 'not_attempted';
  completedSteps: number;
  issue: AppError | null;
  notification: 'not_requested' | 'not_attempted' | 'response_received' | 'review_required';
  notificationIssue: AppError | null;
}
type Dependencies = {
  client: Pick<SupabaseClient, 'from' | 'rpc' | 'functions'>;
  isCurrent?: () => boolean;
  write?: typeof writeTimelineAction;
  notify?: typeof notifyTimelineAttendance;
};

/** Sequential, not atomic. Stop remaining writes at the first uncertain result; never retry. */
export async function writeBatchTimelineAction(input: {
  targets: BatchTimelineTarget[];
  date: string;
  action: BatchAttendanceAction;
  sendNotification: boolean;
}, { client, isCurrent = () => true, write = writeTimelineAction, notify = notifyTimelineAttendance }: Dependencies): Promise<BatchTimelineResult[]> {
  try {
    if (!input.targets.length || !['ride_in', 'check_in', 'check_out', 'ride_out', 'is_absent'].includes(input.action)
      || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
      || !Number.isFinite(Date.parse(input.date + 'T00:00:00Z'))
      || new Date(input.date + 'T00:00:00Z').toISOString().slice(0, 10) !== input.date) throw new AppError('INPUT_INVALID');
    const students = new Set<string>();
    const children = new Set<string>();
    // Validate the entire snapshot before the first write. Never invent a default branch.
    for (const target of input.targets) {
      if (!target.studentId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(target.childId)
        || !target.branchId || target.branchId === 'all'
        || students.has(target.studentId) || children.has(target.childId)) throw new AppError('INPUT_INVALID');
      students.add(target.studentId);
      children.add(target.childId);
    }
    const wantsNotification = input.sendNotification && attendanceNotificationActions.has(input.action as AttendanceNotificationAction);
    const results: BatchTimelineResult[] = input.targets.map(target => ({
      studentId: target.studentId, storage: 'not_attempted', completedSteps: 0, issue: null,
      notification: wantsNotification ? 'not_attempted' : 'not_requested', notificationIssue: null,
    }));
    for (let index = 0; index < input.targets.length; index++) {
      if (!isCurrent()) break;
      const target = input.targets[index];
      let outcome: Awaited<ReturnType<typeof writeTimelineAction>>;
      try {
        outcome = await write({ childId: target.childId, branchId: target.branchId, record: target.record,
          date: input.date, action: input.action }, { client });
      } catch (error: unknown) {
        outcome = { completedSteps: 0, issue: normalizeError(error, 'ATT_TIMELINE_REVIEW_REQUIRED') };
      }
      results[index].completedSteps = outcome.completedSteps;
      results[index].issue = outcome.issue;
      results[index].storage = outcome.issue ? 'review_required' : 'responses_received';
      if (outcome.issue) break;
    }
    // Only fully responded storage paths can be notified, even if a later student failed.
    if (wantsNotification) {
      for (let index = 0; index < input.targets.length; index++) {
        if (!isCurrent()) break;
        if (results[index].storage !== 'responses_received') continue;
        const target = input.targets[index];
        try {
          await notify(target.childId, target.branchId, input.date, input.action as AttendanceNotificationAction, { client });
          results[index].notification = 'response_received';
        } catch (error: unknown) {
          results[index].notification = 'review_required';
          results[index].notificationIssue = normalizeError(error, 'ATT_NOTIFICATION_FAILED');
        }
      }
    }
    return results;
  } catch (error: unknown) {
    throw normalizeError(error, 'ATT_TIMELINE_REVIEW_REQUIRED');
  }
}
