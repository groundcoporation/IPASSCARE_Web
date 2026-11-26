import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';

export interface OfflinePaymentInput {
  billId: string;
  amount: number;
  method: string;
  timing: string;
  date: string;
  memo: string;
}
export interface OfflinePaymentResult {
  paymentId: string;
  stage: 'scheduled' | 'confirmed' | 'confirmation-unconfirmed';
  issues: AppError[];
}
const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Two existing RPC transactions, not one atomic operation. Never auto-retry either write. */
export async function saveOfflinePayment(input: OfflinePaymentInput, { client }: { client: Pick<SupabaseClient, 'rpc'> }): Promise<OfflinePaymentResult> {
  const methods: Record<string, string> = { cash: 'CASH', offline_card: 'OFFLINE_CARD', bank_transfer: 'OFFLINE_TRANSFER' };
  let paymentId: string;
  const memo = input.memo.trim() || null;
  try {
    if (!isUuid(input.billId) || !Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 2147483647
      || !Object.hasOwn(methods, input.method) || !['now', 'scheduled'].includes(input.timing)
      || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new AppError('INPUT_INVALID');
    const day = new Date(input.date + 'T00:00:00Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== input.date) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.rpc('schedule_offline_payment', {
      p_bill_id: input.billId,
      p_amount: input.amount,
      p_payment_method: methods[input.method],
      p_scheduled_at: new Date(input.date + 'T12:00:00+09:00').toISOString(),
      p_memo: memo,
    });
    if (error) throw error;
    if (data?.success !== true || !isUuid(data.payment_id)) throw new AppError('PAYMENT_SAVE_FAILED');
    paymentId = data.payment_id;
  } catch (error: unknown) {
    throw normalizeError(error, 'PAYMENT_SAVE_FAILED');
  }
  if (input.timing === 'scheduled') return { paymentId, stage: 'scheduled', issues: [] };
  return confirmExistingOfflinePayment(paymentId, memo, { client });
}

/** Confirm a known payment; never create another scheduled record. Direct app orders may have no bill. */
export async function confirmExistingOfflinePayment(paymentId: string, memo: string | null, { client, direct = false }: {
  client: Pick<SupabaseClient, 'rpc'>;
  direct?: boolean;
}): Promise<OfflinePaymentResult> {
  if (!isUuid(paymentId)) throw new AppError('INPUT_INVALID');
  try {
    const { data, error } = await client.rpc('confirm_offline_payment', { p_payment_id: paymentId, p_memo: memo });
    if (error) throw error;
    if (data?.success !== true || data.payment_id !== paymentId) throw new AppError('PAYMENT_CONFIRM_PENDING');
    // An idempotent already-paid response omits bill_status; it cannot prove pass issuance.
    if (data.already_paid === true) {
      return { paymentId, stage: 'confirmed', issues: [new AppError('PAYMENT_PACKAGE_PENDING')] };
    }
    if ((!['paid', 'partial'].includes(data.bill_status) && !(direct && data.bill_status === null))
      || typeof data.package_issued !== 'boolean') throw new AppError('PAYMENT_CONFIRM_PENDING');
    const packagePending = (data.bill_status === 'paid' || (direct && data.bill_status === null))
      && (!data.package_issued || !isUuid(data.user_package_id));
    return { paymentId, stage: 'confirmed', issues: packagePending ? [new AppError('PAYMENT_PACKAGE_PENDING')] : [] };
  } catch (error: unknown) {
    const issue = normalizeError(error, 'PAYMENT_CONFIRM_PENDING');
    return { paymentId, stage: 'confirmation-unconfirmed', issues: issue.code === 'PAYMENT_CONFIRM_PENDING'
      ? [issue] : [new AppError('PAYMENT_CONFIRM_PENDING'), issue] };
  }
}
