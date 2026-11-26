import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { assemblePaymentHistory, type PaymentHistoryRow } from '../model/paymentHistory.ts';

/** Read-only; no month predicate, preserving cross-month refund matching. Server row caps remain unchanged. */
export async function loadPaymentHistory(branchId: string | null, { client }: { client: Pick<SupabaseClient, 'from'> }) {
  try {
    if (branchId !== null && (!branchId || branchId === 'all')) throw new AppError('INPUT_INVALID');
    let query = client.from('payments').select('id,user_id,created_at,total_amount,final_amount,payment_method,status,pg_tid,branch_id,order_items,users:users!payments_user_id_fkey(id,name,email)').order('created_at', { ascending: false });
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data)) throw new AppError('PAYMENT_HISTORY_LOAD_FAILED');
    const rows = data as PaymentHistoryRow[];
    const paymentIds = rows.map(row => row.id);
    const userIds = [...new Set(rows.map(row => row.user_id).filter((id): id is string => Boolean(id)))];
    const items = rows.flatMap(row => Array.isArray(row.order_items) ? row.order_items : []);
    const packageIds = [...new Set(items.map(item => item.package_id).filter((id): id is string => Boolean(id)))];
    const optionIds = [...new Set(items.map(item => item.option_id).filter((id): id is string => Boolean(id)))];
    const empty = { data: [], error: null };
    const results = await Promise.all([
      paymentIds.length ? client.from('user_packages').select('payment_id,package_name,price,total_count').in('payment_id', paymentIds) : empty,
      userIds.length ? client.from('children').select('parent_id,child_name').in('parent_id', userIds).is('deleted_at', null) : empty,
      userIds.length ? client.from('academy_students').select('parent_user_id,student_name').in('parent_user_id', userIds) : empty,
      packageIds.length ? client.from('packages').select('id,name').in('id', packageIds) : empty,
      optionIds.length ? client.from('package_options').select('id,label,price,total_count').in('id', optionIds) : empty,
      client.from('academy_sms_charge_logs').select('pg_tid'),
    ]);
    for (const result of results) {
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new AppError('PAYMENT_HISTORY_LOAD_FAILED');
    }
    return assemblePaymentHistory(rows, { products: results[0].data ?? [], children: results[1].data ?? [], students: results[2].data ?? [], packages: results[3].data ?? [], options: results[4].data ?? [], charges: results[5].data ?? [] });
  } catch (error: unknown) { throw normalizeError(error, 'PAYMENT_HISTORY_LOAD_FAILED'); }
}
