import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { confirmExistingOfflinePayment } from './offlinePayment.ts';

export type OfflineStatus = 'scheduled' | 'paid' | 'cancelled';
export interface OfflineLedgerPayment {
  id: string;
  user_id: string;
  user_name: string;
  username?: string | null;
  student_name?: string | null;
  children_names?: string[] | null;
  academy_bill_id?: string | null;
  final_amount: number;
  total_amount: number;
  payment_method: string;
  status: OfflineStatus;
  scheduled_at?: string | null;
  paid_at?: string | null;
  memo?: string | null;
}
const isUuid = (id: unknown): id is string => typeof id === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
type Client = Pick<SupabaseClient, 'rpc' | 'from'>;

export async function loadOfflineLedger(branchId: string | null, status: OfflineStatus, { client }: { client: Client }): Promise<OfflineLedgerPayment[]> {
  try {
    if (!branchId || branchId === 'all') return [];
    if (!['scheduled', 'paid', 'cancelled'].includes(status)) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.rpc('list_offline_payments', { p_branch_id: branchId, p_status: status });
    if (error) throw error;
    if (!Array.isArray(data) || data.some(row => !row || !isUuid(row.id) || typeof row.user_id !== 'string' || row.status !== status)) {
      throw new AppError('OFFLINE_PAYMENT_LOAD_FAILED');
    }
    const rows = data as OfflineLedgerPayment[];
    const userIds = [...new Set(rows.map(row => row.user_id).filter(Boolean))];
    const { data: children, error: childrenError } = userIds.length
      ? await client.from('children').select('parent_id,child_name').in('parent_id', userIds).is('deleted_at', null)
      : { data: [], error: null };
    if (childrenError) throw childrenError;
    if (!Array.isArray(children)) throw new AppError('OFFLINE_PAYMENT_LOAD_FAILED');
    const byParent = new Map<string, string[]>();
    for (const child of children) {
      if (typeof child.parent_id !== 'string' || typeof child.child_name !== 'string' || !child.child_name) continue;
      const names = byParent.get(child.parent_id) || [];
      if (!names.includes(child.child_name)) names.push(child.child_name);
      byParent.set(child.parent_id, names);
    }
    return rows.map(row => ({ ...row, children_names: byParent.get(row.user_id) || [] }));
  } catch (error: unknown) {
    throw normalizeError(error, 'OFFLINE_PAYMENT_LOAD_FAILED');
  }
}

export async function confirmLedgerPayment(payment: OfflineLedgerPayment, { client }: { client: Pick<SupabaseClient, 'rpc'> }) {
  if (payment.status !== 'scheduled') throw new AppError('CONFLICT_ERROR');
  return confirmExistingOfflinePayment(payment.id, payment.memo || null, { client, direct: payment.academy_bill_id === null });
}

export async function cancelLedgerPayment(payment: OfflineLedgerPayment, { client }: { client: Pick<SupabaseClient, 'rpc'> }): Promise<{ alreadyCancelled: boolean }> {
  try {
    if (!isUuid(payment.id)) throw new AppError('INPUT_INVALID');
    if (!['scheduled', 'paid'].includes(payment.status)) throw new AppError('CONFLICT_ERROR');
    const { data, error } = await client.rpc('cancel_offline_payment', {
      p_payment_id: payment.id,
      p_reason: payment.status === 'paid' ? '관리자 웹 현장결제 취소' : '관리자 웹 현장결제 요청 취소',
    });
    if (error) throw error;
    // Existing server contract omits payment_id. Validate it if a newer server includes it.
    if (data?.success !== true || (data.status !== 'cancelled' && data.already_cancelled !== true)
      || (data.payment_id !== undefined && data.payment_id !== payment.id)) throw new AppError('OFFLINE_PAYMENT_CANCEL_UNCONFIRMED');
    return { alreadyCancelled: data.already_cancelled === true };
  } catch (error: unknown) {
    throw normalizeError(error, 'OFFLINE_PAYMENT_CANCEL_UNCONFIRMED');
  }
}
