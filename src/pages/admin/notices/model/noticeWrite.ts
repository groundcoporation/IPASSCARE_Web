import { AppError } from '../../../../errors/appError.ts';
export type NoticeKind = 'branch' | 'hq';
export interface NoticeWriter { id: string; role: string; name?: string | null; branch_id: string | null }
export interface NoticeForm { title: string; content: string; important: boolean; onHome: boolean; branchId: string | null; sendPush: boolean }
export interface NoticeTarget { id: string; branchId: string | null }
export const isNoticeId = (id: string) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export function validateNoticeWrite(kind: NoticeKind, writer: NoticeWriter | null | undefined, form: NoticeForm | null, target: NoticeTarget | null) {
  if (!['branch', 'hq'].includes(kind) || (target && !isNoticeId(target.id))) throw new AppError('NOTICE_INPUT_INVALID');
  if (!writer?.id) throw new AppError('AUTH_REQUIRED');
  if (kind === 'hq' ? writer.role !== 'admin' : !['admin', 'director', 'teacher', 'coach'].includes(writer.role)) throw new AppError('PERMISSION_DENIED');
  if (form && (!form.title.trim() || !form.content.trim() || (form.branchId !== null && (!form.branchId || form.branchId === 'all')))) throw new AppError('NOTICE_INPUT_INVALID');
  if (kind === 'branch' && writer.role !== 'admin' && (!writer.branch_id || (form && form.branchId !== writer.branch_id) || (target && target.branchId !== writer.branch_id))) throw new AppError('PERMISSION_DENIED');
}
