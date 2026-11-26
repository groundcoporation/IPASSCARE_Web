import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, RefreshCw, Search, XCircle } from 'lucide-react';
import { supabase } from '../../../../lib/supabaseClient';
import { AppError } from '../../../../errors/appError';
import { handleError } from '../../../../errors/handleError';
import { loadOfflineLedger, confirmLedgerPayment, cancelLedgerPayment, type OfflineStatus, type OfflineLedgerPayment } from '../api/offlineLedger';

interface Props {
  activeBranchId: string | null;
}

const tabs: Array<{ id: OfflineStatus; label: string }> = [
  { id: 'scheduled', label: '결제 예정' },
  { id: 'paid', label: '수납 완료' },
  { id: 'cancelled', label: '취소' },
];

const methodLabel = (method: string) => ({
  CASH: '현장 결제 : 현금',
  OFFLINE_CARD: '현장 결제 : 카드',
  OFFLINE_TRANSFER: '현장 결제 : 계좌이체',
}[method] || method || '미지정');

export const AdminOfflinePaymentTab: React.FC<Props> = ({ activeBranchId }) => {
  const [status, setStatus] = useState<OfflineStatus>('scheduled');
  const [payments, setPayments] = useState<OfflineLedgerPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const readSequence = useRef(0);
  const mutationInFlight = useRef(false);

  const loadPayments = useCallback(async (reportError = true) => {
    const sequence = ++readSequence.current;
    setLoading(true);
    try {
      const rows = await loadOfflineLedger(activeBranchId, status, { client: supabase });
      if (sequence !== readSequence.current) return;
      setPayments(rows);
    } catch (error: unknown) {
      if (sequence !== readSequence.current) return;
      setPayments([]);
      if (!reportError) throw new AppError('OFFLINE_PAYMENT_REFRESH_FAILED', error);
      await handleError(error, 'OFFLINE_PAYMENT_LOAD_FAILED', { operation: 'offline-payment.load' });
    } finally {
      if (sequence === readSequence.current) setLoading(false);
    }
  }, [activeBranchId, status]);

  useEffect(() => {
    void loadPayments();
    return () => { readSequence.current += 1; };
  }, [loadPayments]);

  const filteredPayments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return payments;
    return payments.filter((payment) => {
      const children = payment.student_name || payment.children_names?.join(' ') || '';
      return `${payment.user_name} ${payment.username || ''} ${children}`.toLowerCase().includes(keyword);
    });
  }, [payments, search]);

  const confirmPayment = async (payment: OfflineLedgerPayment) => {
    if (mutationInFlight.current || payment.status !== 'scheduled') return;
    if (!confirm(`${payment.user_name}님의 현장결제를 실제로 수납했습니까?\n완료하면 이용권이 반영되며 포인트는 적립되지 않습니다.`)) return;
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const sequence = readSequence.current;
    setProcessingId(payment.id);
    try {
      const result = await confirmLedgerPayment(payment, { client: supabase });
      for (const issue of result.issues) {
        await handleError(issue, 'PAYMENT_CONFIRM_PENDING', { operation: 'offline-payment.confirm', transactionId: payment.id });
      }
      if (sequence === readSequence.current) await loadPayments(false);
    } catch (error: unknown) {
      await handleError(error, 'PAYMENT_CONFIRM_PENDING', { operation: 'offline-payment.confirm', transactionId: payment.id });
    } finally {
      mutationInFlight.current = false;
      setProcessingId(null);
    }
  };

  const cancelPayment = async (payment: OfflineLedgerPayment) => {
    if (mutationInFlight.current || !['scheduled', 'paid'].includes(payment.status)) return;
    const isPaid = payment.status === 'paid';
    if (!confirm(isPaid
      ? `${payment.user_name}님의 수납 완료 현장결제를 취소할까요?\n미사용 이용권이 회수됩니다. 실제 환불은 별도로 확인해 주세요.`
      : `${payment.user_name}님의 현장결제 요청을 취소할까요?`)) return;
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const sequence = readSequence.current;
    setProcessingId(payment.id);
    try {
      const result = await cancelLedgerPayment(payment, { client: supabase });
      alert(result.alreadyCancelled ? '이미 취소된 현장결제입니다.' : isPaid
        ? '현장결제 장부 취소와 미사용 이용권 회수가 완료되었습니다. 실제 환불은 별도로 확인해 주세요.'
        : '현장결제 요청이 취소되었습니다.');
      if (sequence === readSequence.current) await loadPayments(false);
    } catch (error: unknown) {
      await handleError(error, 'OFFLINE_PAYMENT_CANCEL_UNCONFIRMED', { operation: 'offline-payment.cancel', transactionId: payment.id });
    } finally {
      mutationInFlight.current = false;
      setProcessingId(null);
    }
  };

  if (!activeBranchId || activeBranchId === 'all') {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center">
        <p className="font-black text-amber-800">현장결제를 확인할 지점을 먼저 선택해 주세요.</p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">현장결제 관리</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">앱에서 접수된 현장결제를 확인하고 실제 수납 후 완료 처리합니다.</p>
        </div>
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setStatus(tab.id)} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${status === tab.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {tab.label}
            </button>
          ))}
          <button onClick={() => void loadPayments()} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" aria-label="새로고침">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="학부모명, 아이디, 자녀명 검색" className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm font-bold outline-none focus:border-blue-400" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-52 items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : filteredPayments.length === 0 ? (
          <div className="flex h-52 flex-col items-center justify-center text-slate-400">
            <CalendarClock size={36} />
            <p className="mt-3 text-sm font-black">표시할 현장결제가 없습니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPayments.map((payment) => {
              const childNames = payment.student_name
                ? [payment.student_name]
                : (payment.children_names || []);
              const processing = processingId !== null;
              const targetTime = payment.status === 'paid' ? payment.paid_at : payment.scheduled_at;
              return (
                <article key={payment.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-black text-slate-950">{payment.user_name}</strong>
                      {payment.username && <span className="text-xs font-bold text-slate-400">({payment.username})</span>}
                      {childNames.length > 0 && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                          자녀: {childNames.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs font-bold text-slate-500">
                      {methodLabel(payment.payment_method)} · {targetTime ? new Date(targetTime).toLocaleString('ko-KR') : '-'}
                    </div>
                    {payment.memo && <p className="mt-2 text-xs text-slate-500">{payment.memo}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black text-slate-950">{Number(payment.final_amount || payment.total_amount || 0).toLocaleString()}원</div>
                    <div className="mt-1 text-[11px] font-black text-slate-400">{status === 'scheduled' ? '결제 예정' : status === 'paid' ? '수납 완료' : '취소'}</div>
                  </div>
                  {(payment.status === 'scheduled' || payment.status === 'paid') && (
                    <div className="flex gap-2 lg:ml-3">
                      <button disabled={processing} onClick={() => void cancelPayment(payment)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-black text-rose-600 disabled:opacity-50"><XCircle size={15} /> {payment.status === 'paid' ? '결제 취소' : '요청 취소'}</button>
                      {payment.status === 'scheduled' && <button disabled={processing} onClick={() => void confirmPayment(payment)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 size={15} /> 수납 완료</button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
