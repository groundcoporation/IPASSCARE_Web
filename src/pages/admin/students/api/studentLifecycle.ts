import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import type { WithdrawalRecord } from '../types';

type Dependencies = { client: Pick<SupabaseClient, 'from' | 'rpc'> };

/** Preserve the archive RPC; never physically delete a student or retry automatically. */
export async function archiveStudentRecord(id: string, reason: string, { client }: Dependencies): Promise<void> {
  try {
    const virtual = id.startsWith('child-');
    if (!id.trim() || (virtual && !id.slice(6).trim())) throw new AppError('REQUIRED_DATA_MISSING');
    const { data, error } = await client.rpc('archive_academy_student', {
      p_student_id: virtual ? null : id,
      p_child_id: virtual ? id.slice(6) : null,
      p_reason: reason,
    });
    if (error) throw error;
    if (data?.status !== 'archived' && data?.status !== 'already_archived') {
      throw new AppError('STUDENT_ARCHIVE_UNCONFIRMED');
    }
  } catch (error: unknown) {
    throw normalizeError(error, 'STUDENT_ARCHIVE_UNCONFIRMED');
  }
}

interface RefundRecordInput {
  record: Pick<WithdrawalRecord, 'id' | 'is_inferred'>;
  status: WithdrawalRecord['refund_status'];
  amount: number;
  memo: string;
}

/** Update bookkeeping only. Does not cancel, transfer or refund a payment. */
export async function saveRefundRecord(
  { record, status, amount, memo }: RefundRecordInput,
  { client, now = () => new Date() }: Dependencies & { now?: () => Date },
): Promise<void> {
  try {
    if (!record.id.trim()) throw new AppError('REQUIRED_DATA_MISSING');
    if (record.is_inferred || record.id.startsWith('deleted-user:')) throw new AppError('DATA_REFERENCE_ERROR');
    if (!['pending', 'completed', 'none'].includes(status) || !Number.isSafeInteger(amount) || amount < 0) {
      throw new AppError('INPUT_INVALID');
    }
    const { data, error } = await client.from('user_withdrawals').update({
      refund_status: status,
      refund_amount: amount,
      refund_memo: memo.trim(),
      refunded_at: status === 'completed' ? now().toISOString() : null,
    }).eq('id', record.id).select('id').single();
    if (error) throw error;
    if (data?.id !== record.id) throw new AppError('REFUND_RECORD_SAVE_UNCONFIRMED');
  } catch (error: unknown) {
    throw normalizeError(error, 'REFUND_RECORD_SAVE_UNCONFIRMED');
  }
}
