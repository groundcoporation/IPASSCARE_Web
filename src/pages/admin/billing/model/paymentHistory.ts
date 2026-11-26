import { kstDateKey } from '../../attendance/model/ledgerRules.ts';
import { firstJoined } from '../../../../utils/relations.ts';

export type PaymentProduct = { package_name: string | null; price: number | null; total_count: number | null };
export type PaymentOrderItem = { package_id?: string | null; option_id?: string | null; quantity?: number | null };
type Payer = { name: string | null; email: string | null };
export type Payment = {
  id: string; user_id?: string | null; created_at: string; total_amount: number | null; final_amount: number | null;
  payment_method: string | null; status: string | null; pg_tid: string | null; order_items?: PaymentOrderItem[] | null;
  users: Payer | null; products: PaymentProduct[]; childrenNames?: string[]; isIpointCharge?: boolean;
};
export type PaymentHistoryRow = Omit<Payment, 'users' | 'products' | 'childrenNames' | 'isIpointCharge'> & {
  users: Payer | Payer[] | null; memo?: string | null; source?: string | null;
};
export interface PaymentHistoryRelations {
  products: (PaymentProduct & { payment_id: string })[];
  children: { parent_id: string | null; child_name: string | null }[];
  students: { parent_user_id: string | null; student_name: string | null }[];
  packages: { id: string; name: string | null }[];
  options: { id: string; label: string | null; price: number | null; total_count: number | null }[];
  charges: { pg_tid: string | null }[];
}

/** Display recovery only: current catalogs are not immutable historical sales evidence. */
export function assemblePaymentHistory(rows: PaymentHistoryRow[], relations: PaymentHistoryRelations): Payment[] {
  const products = new Map<string, PaymentProduct[]>();
  relations.products.forEach(product => products.set(product.payment_id, [...(products.get(product.payment_id) ?? []), { ...product }]));
  const packages = new Map(relations.packages.map(item => [item.id, item]));
  const options = new Map(relations.options.map(item => [item.id, item]));
  const names = new Map<string, string[]>();
  const addName = (parent: string | null, name: string | null) => {
    if (!parent || !name) return;
    const list = names.get(parent) ?? [];
    if (!list.includes(name)) list.push(name);
    names.set(parent, list);
  };
  relations.children.forEach(item => addName(item.parent_id, item.child_name));
  relations.students.forEach(item => addName(item.parent_user_id, item.student_name));
  const smsTids = new Set(relations.charges.map(item => item.pg_tid).filter(Boolean));
  return rows.map(row => {
    let linked = products.get(row.id) ?? [];
    if (!linked.length && Array.isArray(row.order_items)) {
      linked = row.order_items.flatMap(item => {
        const product = item.package_id ? packages.get(item.package_id) : null;
        const option = item.option_id ? options.get(item.option_id) : null;
        return !product && !option ? [] : [{ package_name: [product?.name, option?.label].filter(Boolean).join(' - ') || '상품명 없음', price: option?.price ?? null, total_count: option?.total_count ?? null }];
      });
    }
    return { ...row, users: firstJoined(row.users), products: linked,
      childrenNames: [...(names.get(row.user_id ?? '') ?? [])],
      isIpointCharge: Boolean(row.memo?.includes('i-Point') || row.source === 'web_ipoint' || (row.pg_tid && smsTids.has(row.pg_tid))),
    };
  });
}

export const paymentsForMonth = (payments: Payment[], month: string) => payments.filter(item => kstDateKey(item.created_at)?.slice(0, 7) === month);
export function filterPayments(payments: Payment[], search: string, status: string) {
  const needle = search.trim().toLowerCase();
  return payments.filter(item => {
    const text = `${item.users?.name ?? ''} ${item.users?.email ?? ''} ${(item.childrenNames ?? []).join(' ')} ${item.pg_tid ?? ''} ${item.id} ${item.products.map(product => product.package_name).join(' ')}`.toLowerCase();
    return (status === 'all' || item.status === status) && text.includes(needle);
  });
}
/** Existing gross paid-status sum, not accounting revenue/net settlement. */
export function paymentStats(payments: Payment[]) {
  const paid = payments.filter(item => ['paid', 'success'].includes(item.status ?? ''));
  return { revenue: paid.reduce((sum, item) => sum + (item.final_amount ?? item.total_amount ?? 0), 0), paid: paid.length,
    pending: payments.filter(item => ['pending_payment', 'scheduled'].includes(item.status ?? '')).length,
    failed: payments.filter(item => ['failed', 'cancelled', 'canceled'].includes(item.status ?? '')).length };
}
type RefundPayment = Pick<Payment, 'pg_tid' | 'final_amount' | 'total_amount'>;
export function paymentRefundInfo(item: RefundPayment | null, payments: RefundPayment[]) {
  if (!item?.pg_tid) return { refunded: 0, remaining: item ? (item.final_amount ?? item.total_amount ?? 0) : 0 };
  const rows = payments.filter(p => p.pg_tid === `${item.pg_tid}_REFUND` || p.pg_tid === `${item.pg_tid}-REFUND`);
  const refunded = rows.reduce((sum, p) => sum + Math.abs(p.final_amount ?? p.total_amount ?? 0), 0);
  return { refunded, remaining: Math.max(0, (item.final_amount ?? item.total_amount ?? 0) - refunded) };
}
export const statusText = (status: string | null) => ({ paid: '결제 완료', success: '결제 완료', scheduled: '현장결제 대기', pending_payment: '입금 대기', failed: '결제 실패', cancelled: '취소', canceled: '취소', refunded: '환불' }[status ?? ''] ?? status ?? '미확인');
export function paymentDetail(method: string | null, pgTid: string | null) {
  if (method === 'CASH') return '현장 결제 : 현금';
  if (method === 'OFFLINE_CARD') return '현장 결제 : 카드';
  if (method === 'OFFLINE_TRANSFER') return '현장 결제 : 계좌이체';
  if (method === 'VBANK') { const [bank, account] = (pgTid ?? '').split(':'); return account ? `${bank || '가상계좌'} · ${account}` : '가상계좌'; }
  return ({ BANK: '계좌이체', POINT: '포인트 결제', CARD: '신용·체크카드' }[method ?? ''] ?? method ?? '결제수단 미확인');
}
export function paymentReference(payment: Pick<Payment, 'id' | 'pg_tid' | 'status' | 'payment_method'>) {
  if (payment.pg_tid) return payment.pg_tid;
  if (payment.status === 'scheduled' && ['CASH', 'OFFLINE_CARD', 'OFFLINE_TRANSFER'].includes(payment.payment_method ?? '')) return `현장접수-${payment.id.slice(0, 8).toUpperCase()}`;
  return payment.id;
}
