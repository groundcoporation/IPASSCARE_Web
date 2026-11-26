import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError, normalizeAsyncError } from '../../../../errors/appError.ts';

export interface JournalNotificationResult { targetCount: number; sentCount: number; failedCount: number; }
/** Notify an already-saved journal once; failures never mean the journal save failed. */
export async function notifyJournal(type: 'study' | 'counsel', id: string, updated: boolean, { client }: { client: Pick<SupabaseClient, 'functions'> }): Promise<JournalNotificationResult> {
  try {
    const { data, error } = await client.functions.invoke('send-journal-notification', {
      body: { journalType: type, journalId: id, ...(updated ? { notificationKind: 'updated' } : {}) },
    });
    if (error) throw await normalizeAsyncError(error, 'JOURNAL_NOTIFICATION_FAILED');
    if (data?.success !== true || ![data.targetCount, data.sentCount, data.failedCount].every(value => Number.isInteger(value) && value >= 0)) throw new AppError('JOURNAL_NOTIFICATION_FAILED');
    return { targetCount: data.targetCount, sentCount: data.sentCount, failedCount: data.failedCount };
  } catch (error: unknown) { throw normalizeError(error, 'JOURNAL_NOTIFICATION_FAILED'); }
}
