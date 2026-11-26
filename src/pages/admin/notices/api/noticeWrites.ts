import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError, normalizeAsyncError } from '../../../../errors/appError.ts';
import { validateNoticeWrite, isNoticeId, type NoticeKind, type NoticeWriter, type NoticeForm, type NoticeTarget } from '../model/noticeWrite.ts';
type Client = Pick<SupabaseClient, 'from' | 'auth' | 'functions'>;
async function writerUser(writer: NoticeWriter, client: Pick<SupabaseClient, 'auth'>) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== writer.id) throw new AppError('AUTH_REQUIRED');
  return data.user;
}
export async function notifySavedNotice(id: string, { client }: { client: Pick<SupabaseClient, 'functions'> }) {
  try {
    if (!isNoticeId(id)) throw new AppError('NOTICE_INPUT_INVALID');
    const { data, error } = await client.functions.invoke('send-notice-push', { body: { noticeId: id } });
    if (error) throw await normalizeAsyncError(error, 'NOTICE_PUSH_PARTIAL');
    if (data?.success !== true || [data.targetCount, data.sentCount, data.failedCount].some(value => !Number.isSafeInteger(value) || value < 0)) throw new AppError('NOTICE_PUSH_PARTIAL');
    return { targetCount: data.targetCount as number, sentCount: data.sentCount as number, failedCount: data.failedCount as number };
  } catch (error: unknown) { throw new AppError('NOTICE_PUSH_PARTIAL', error); }
}
/** Save once, confirm row, then notify only a newly inserted ordinary notice when requested. */
export async function saveNoticeRecord(kind: NoticeKind, form: NoticeForm, target: NoticeTarget | null, writer: NoticeWriter, { client, now = () => new Date().toISOString() }: { client: Client; now?: () => string }) {
  let savedId: string;
  try {
    validateNoticeWrite(kind, writer, form, target);
    const user = await writerUser(writer, client);
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const authorName = text(writer.name) || text(user.user_metadata?.name) || text(user.email).split('@')[0] || '관리자';
    const payload: Record<string, unknown> = { title: form.title.trim(), content: form.content.trim(), is_important: form.important,
      author_name: kind === 'hq' ? '아이패스케어 본사' : authorName, updated_at: now() };
    if (kind === 'branch') Object.assign(payload, { is_on_home: form.onHome, author_id: writer.id, branch_id: form.branchId,
      author_badge: writer.role === 'admin' ? '관리자' : writer.role === 'director' ? '원장' : '선생님' });
    const table = kind === 'hq' ? 'headquarter_notices' : 'notices';
    let query;
    if (target) {
      query = client.from(table).update(payload).eq('id', target.id);
      if (kind === 'branch') query = target.branchId === null ? query.is('branch_id', null) : query.eq('branch_id', target.branchId);
    } else query = client.from(table).insert([{ ...payload, ...(kind === 'hq' ? { created_at: now() } : {}) }]);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    if (!data || !isNoticeId(data.id ?? '') || (target && data.id !== target.id)
      || Object.entries(payload).some(([key, value]) => key !== 'updated_at' && data[key] !== value)) throw new AppError('NOTICE_WRITE_UNCONFIRMED');
    savedId = data.id;
  } catch (error: unknown) { throw normalizeError(error, 'NOTICE_WRITE_UNCONFIRMED'); }
  let pushResult: Awaited<ReturnType<typeof notifySavedNotice>> | null = null;
  let pushIssue: AppError | null = null;
  if (kind === 'branch' && !target && form.sendPush) {
    try { pushResult = await notifySavedNotice(savedId, { client }); if (pushResult.failedCount > 0) pushIssue = new AppError('NOTICE_PUSH_PARTIAL'); }
    catch (error: unknown) { pushIssue = new AppError('NOTICE_PUSH_PARTIAL', error); }
  }
  return { id: savedId, pushResult, pushIssue };
}
export async function deleteNoticeRecord(kind: NoticeKind, target: NoticeTarget, writer: NoticeWriter, { client }: { client: Pick<SupabaseClient, 'from' | 'auth'> }) {
  try {
    validateNoticeWrite(kind, writer, null, target);
    await writerUser(writer, client);
    let query = client.from(kind === 'hq' ? 'headquarter_notices' : 'notices').delete().eq('id', target.id);
    if (kind === 'branch') query = target.branchId === null ? query.is('branch_id', null) : query.eq('branch_id', target.branchId);
    const { data, error } = await query.select('id').single();
    if (error) throw error;
    if (!data || data.id !== target.id) throw new AppError('NOTICE_WRITE_UNCONFIRMED');
  } catch (error: unknown) { throw normalizeError(error, 'NOTICE_WRITE_UNCONFIRMED'); }
}
