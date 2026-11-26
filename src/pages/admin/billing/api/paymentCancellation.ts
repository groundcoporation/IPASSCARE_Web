import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError, normalizeAsyncError } from '../../../../errors/appError.ts';
import { preparePaymentCancellation, type PaymentCancellationInput } from '../model/paymentCancellation.ts';

/** No browser-side payments/package updates, refunds, retries, or RPC fallback writes. */
export async function cancelPayment(input: PaymentCancellationInput, { client }: { client: Pick<SupabaseClient, 'rpc' | 'functions'> }) {
  try {
    const plan = preparePaymentCancellation(input);
    if (plan.kind === 'offline') {
      const { data, error } = await client.rpc('cancel_offline_payment', { p_payment_id: plan.paymentId, p_reason: plan.reason });
      if (error) throw error;
      if (data?.success !== true || (data.status !== 'cancelled' && data.already_cancelled !== true)
        || (data.payment_id !== undefined && data.payment_id !== plan.paymentId)) throw new AppError('PAYMENT_CANCEL_FAILED');
      return { kind: 'offline' as const, alreadyCancelled: data.already_cancelled === true };
    }
    const { data, error } = await client.functions.invoke('kspay-cancel', {
      body: { payment_id: plan.paymentId, cancel_reason: plan.reason, cancel_amount: plan.amount },
    });
    if (error) throw await normalizeAsyncError(error, 'PAYMENT_CANCEL_FAILED');
    if (data?.success !== true || data.error || !['A0200', '0000', '0200'].includes(String(data.code))
      || data.cancelType !== '0' || data.cancelAmount !== plan.amount
      || (data.payment_id !== undefined && data.payment_id !== plan.paymentId)) throw new AppError('PAYMENT_CANCEL_FAILED');
    return { kind: 'card' as const, alreadyCancelled: false };
  } catch (error: unknown) { throw normalizeError(error, 'PAYMENT_CANCEL_FAILED'); }
}
