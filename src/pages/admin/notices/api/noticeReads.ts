import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
export interface Notice {
  id: string; title: string; content: string; is_important: boolean; is_on_home: boolean;
  author_name: string | null; author_badge: string | null; author_id: string | null;
  branch_id: string | null; created_at: string; updated_at: string | null;
}
export interface HqNotice {
  id: string; title: string; content: string; is_important: boolean;
  author_name: string | null; created_at: string; updated_at: string | null;
}
type Client = Pick<SupabaseClient, 'from'>;
function validRows(data: unknown): data is HqNotice[] {
  return Array.isArray(data) && data.every(row => row && typeof row.id === 'string' && typeof row.title === 'string' && typeof row.content === 'string');
}
/** null is an explicit admin all-branch scope; caller authorization and server RLS still apply. */
export async function loadNoticeList(branchId: string | null, { client }: { client: Client }): Promise<Notice[]> {
  try {
    if (branchId !== null && (!/^[a-zA-Z0-9_-]+$/.test(branchId) || branchId === 'all')) throw new AppError('INPUT_INVALID');
    let query = client.from('notices').select('*');
    if (branchId) query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    const { data, error } = await query.order('is_important', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    if (!validRows(data)) throw new AppError('NOTICE_LOAD_FAILED');
    return data as Notice[];
  } catch (error: unknown) { throw normalizeError(error, 'NOTICE_LOAD_FAILED'); }
}
export async function loadHeadquarterNotices({ client }: { client: Client }): Promise<HqNotice[]> {
  try {
    const { data, error } = await client.from('headquarter_notices').select('*').order('is_important', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    if (!validRows(data)) throw new AppError('NOTICE_LOAD_FAILED');
    return data;
  } catch (error: unknown) { throw normalizeError(error, 'NOTICE_LOAD_FAILED'); }
}
