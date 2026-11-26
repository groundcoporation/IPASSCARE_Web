import { AppError } from '../../../../errors/appError.ts';

export interface CancellablePayment {
  id: string;
  pg_tid: string | null;
  payment_method: string | null;
  status: string | null;
  final_amount: number | null;
  total_amount: number | null;
}
export interface PaymentCancellationInput {
  payment: CancellablePayment;
  amount: number;
  remaining: number;
  reason: string;
}
/** Only a full, unrefunded card/onsite payment has a supported cancellation contract here. */
export function preparePaymentCancellation(input: PaymentCancellationInput) {
  const { payment, amount, remaining } = input;
  const total = payment.final_amount ?? payment.total_amount ?? 0;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payment.id)
    || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(total) || total <= 0
    || !Number.isSafeInteger(remaining) || remaining < 0 || amount > remaining || remaining > total) throw new AppError('INPUT_INVALID');
  if (amount !== total || remaining !== total) throw new AppError('PAYMENT_CANCEL_UNSUPPORTED');
  const method = (payment.payment_method || '').toUpperCase();
  const offline = ['CASH', 'OFFLINE_CARD', 'OFFLINE_TRANSFER'].includes(method);
  if (!['paid', 'success', ...(offline ? ['scheduled'] : [])].includes(payment.status || '')) throw new AppError('CONFLICT_ERROR');
  if (offline) return { kind: 'offline' as const, paymentId: payment.id, amount, status: payment.status === 'scheduled' ? 'scheduled' as const : 'paid' as const, reason: input.reason.trim() || '관리자 웹 현장결제 취소' };
  if (method !== 'CARD' || !payment.pg_tid?.trim() || payment.pg_tid.startsWith('OFFLINE_')) throw new AppError('PAYMENT_CANCEL_UNSUPPORTED');
  return { kind: 'card' as const, paymentId: payment.id, amount, reason: input.reason.trim() || '관리자 웹 취소' };
}
