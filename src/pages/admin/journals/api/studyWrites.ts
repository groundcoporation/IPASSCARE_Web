import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import type { StudyLog } from './studyData';

export type StudyPayload = Pick<StudyLog, 'branch_id' | 'student_id' | 'class_schedule_id' | 'class_name' | 'teacher_name' | 'lesson_date' | 'title' | 'content' | 'homework' | 'special_note'>;
type Dependencies = { client: Pick<SupabaseClient, 'from'>; now?: () => string };
const isUuid = (id: unknown): id is string => typeof id === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function saveStudyLog(payload: StudyPayload, editingId: string | null, visible: boolean, { client, now = () => new Date().toISOString() }: Dependencies): Promise<StudyLog> {
  try {
    if (!isUuid(payload.student_id) || !payload.branch_id || !payload.title.trim() || !payload.content.trim() || (editingId && !isUuid(editingId))) throw new AppError('INPUT_INVALID');
    const value = { ...payload, is_parent_visible: visible, updated_at: now() };
    const query = editingId
      ? client.from('academy_study_logs').update(value).eq('id', editingId)
      : client.from('academy_study_logs').insert([value]);
    const { data, error } = await query.select().single();
    if (error) throw error;
    if (!data || !isUuid(data.id) || (editingId && data.id !== editingId) || data.student_id !== payload.student_id || data.branch_id !== payload.branch_id
      || data.is_parent_visible !== visible) throw new AppError('JOURNAL_SAVE_UNCONFIRMED');
    return data as StudyLog;
  } catch (error: unknown) { throw normalizeError(error, 'JOURNAL_SAVE_UNCONFIRMED'); }
}

export async function publishStudyLog(id: string, { client, now = () => new Date().toISOString() }: Dependencies): Promise<void> {
  try {
    if (!isUuid(id)) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.from('academy_study_logs').update({ is_parent_visible: true, updated_at: now() })
      .eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data || data.id !== id) throw new AppError('JOURNAL_SAVE_UNCONFIRMED');
  } catch (error: unknown) { throw normalizeError(error, 'JOURNAL_SAVE_UNCONFIRMED'); }
}

export async function deleteStudyLog(id: string, { client }: Dependencies): Promise<void> {
  try {
    if (!isUuid(id)) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.from('academy_study_logs').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data || data.id !== id) throw new AppError('JOURNAL_DELETE_UNCONFIRMED');
  } catch (error: unknown) { throw normalizeError(error, 'JOURNAL_DELETE_UNCONFIRMED'); }
}
