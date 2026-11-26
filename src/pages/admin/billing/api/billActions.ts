import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import type { Bill, AppPaymentRequest } from '../types';

type Dependencies = { client: Pick<SupabaseClient, 'rpc'> };
type DeletableBill = Pick<Bill, 'id' | 'amount_paid' | 'status'>;
type DeletableRequest = Pick<AppPaymentRequest, 'id' | 'issued_source' | 'status'>;
type FreeBill = Pick<Bill, 'id' | 'status' | 'amount_due' | 'amount_paid' | 'payment_request_id'>;
const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const canDeleteBill = (bill: DeletableBill) => bill.amount_paid === 0
  && ['unpaid', 'declined', 'expired'].includes(bill.status);
export const canDeleteAppRequest = (request: DeletableRequest) => request.issued_source === 'admin_app'
  && ['pending', 'declined', 'expired', 'cancelled'].includes(request.status);

/** Existing RPCs only. Never retry writes or fall back to table deletes. */
export async function deleteBill(bill: DeletableBill, { client }: Dependencies): Promise<void> {
  try {
    if (!isUuid(bill.id)) throw new AppError('INPUT_INVALID');
    if (!canDeleteBill(bill)) throw new AppError('BILL_PAYMENT_EXISTS');
    const { data, error } = await client.rpc('delete_unpaid_academy_bill', {
      p_bill_id: bill.id, p_reason: '수납 관리에서 청구서 삭제',
    });
    if (error) throw error;
    if (data?.success !== true || data.bill_id !== bill.id) throw new AppError('BILL_DELETE_UNCONFIRMED');
  } catch (error: unknown) {
    throw normalizeError(error, 'BILL_DELETE_UNCONFIRMED');
  }
}

export async function deleteAppPaymentRequest(request: DeletableRequest, { client }: Dependencies): Promise<void> {
  try {
    if (!isUuid(request.id)) throw new AppError('INPUT_INVALID');
    if (!canDeleteAppRequest(request)) throw new AppError('CONFLICT_ERROR');
    const { data, error } = await client.rpc('delete_unpaid_app_payment_request', {
      p_request_id: request.id, p_reason: '수납 관리에서 어플 관리자 직접 청구 삭제',
    });
    if (error) throw error;
    if (data?.success !== true || data.request_id !== request.id) throw new AppError('BILL_DELETE_UNCONFIRMED');
  } catch (error: unknown) {
    throw normalizeError(error, 'BILL_DELETE_UNCONFIRMED');
  }
}

export async function completeFreeBill(bill: FreeBill, { client }: Dependencies): Promise<{ alreadyCompleted: boolean }> {
  try {
    if (!isUuid(bill.id)) throw new AppError('INPUT_INVALID');
    if (bill.status !== 'unpaid' || bill.amount_due !== 0 || bill.amount_paid !== 0 || bill.payment_request_id) {
      throw new AppError('BILL_NOT_FREE');
    }
    const { data, error } = await client.rpc('complete_free_academy_bill', { p_bill_id: bill.id });
    if (error) throw error;
    if (data?.success !== true || typeof data.already_completed !== 'boolean'
      || (!data.already_completed && (!isUuid(data.payment_id) || !isUuid(data.user_package_id)))) {
      throw new AppError('BILL_FREE_FAILED');
    }
    return { alreadyCompleted: data.already_completed };
  } catch (error: unknown) {
    throw normalizeError(error, 'BILL_FREE_FAILED');
  }
}
