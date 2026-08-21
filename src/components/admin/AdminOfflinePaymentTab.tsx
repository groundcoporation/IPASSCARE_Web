import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, RefreshCw, Search, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

type OfflineStatus = 'scheduled' | 'paid' | 'cancelled';

type OfflinePayment = {
  id: string;
  user_id: string;
  user_name: string;
  username?: string | null;
  student_name?: string | null;
  children_names?: string[] | null;
  final_amount: number;
  total_amount: number;
  payment_method: string;
  status: OfflineStatus;
  scheduled_at?: string | null;
  paid_at?: string | null;
  memo?: string | null;
};

interface Props {
  activeBranchId: string;
}

const tabs: Array<{ id: OfflineStatus; label: string }> = [
  { id: 'scheduled', label: '결제 예정' },
  { id: 'paid', label: '수납 완료' },
  { id: 'cancelled', label: '취소' },
];

const methodLabel = (method: string) => ({
  CASH: '현금',
  OFFLINE_CARD: '현장 카드',
  OFFLINE_TRANSFER: '계좌이체',
}[method] || method || '미지정');

export const AdminOfflinePaymentTab: React.FC<Props> = ({ activeBranchId }) => {
  const [status, setStatus] = useState<OfflineStatus>('scheduled');
  const [payments, setPayments] = useState<OfflinePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadPayments = useCallback(async () => {
    if (!activeBranchId || activeBranchId === 'all') {
      setPayments([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_offline_payments', {
        p_branch_id: activeBranchId,
        p_status: status,
      });
      if (error) throw error;
      const paymentRows = Array.isArray(data) ? data as OfflinePayment[] : [];
      const userIds = [...new Set(paymentRows.map((payment) => payment.user_id).filter(Boolean))];
      const { data: children, error: childrenError } = userIds.length
        ? await supabase
            .from('children')
            .select('parent_id,child_name')
            .in('parent_id', userIds)
            .is('deleted_at', null)
        : { data: [], error: null };
      if (childrenError) throw childrenError;

      const childrenByParent = new Map<string, string[]>();
      (children || []).forEach((child: any) => {
        if (!child.parent_id || !child.child_name) return;
        const names = childrenByParent.get(child.parent_id) || [];
        if (!names.includes(child.child_name)) names.push(child.child_name);
        childrenByParent.set(child.parent_id, names);
      });

      setPayments(paymentRows.map((payment) => ({
        ...payment,
        children_names: childrenByParent.get(payment.user_id) || [],
      })));
    } catch (error: any) {
      console.error('[OfflinePayment] 목록 조회 실패:', error);
      alert(error?.message || '현장결제 내역을 불러오지 못했습니다.');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, status]);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const filteredPayments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return payments;
    return payments.filter((payment) => {
      const children = payment.student_name || payment.children_names?.join(' ') || '';
      return `${payment.user_name} ${payment.username || ''} ${children}`.toLowerCase().includes(keyword);
    });
  }, [payments, search]);

  const confirmPayment = async (payment: OfflinePayment) => {
    if (!confirm(`${payment.user_name}님의 현장결제를 실제로 수납했습니까?\n완료하면 포인트와 이용권이 반영됩니다.`)) return;
    setProcessingId(payment.id);
    try {
      const { error } = await supabase.rpc('confirm_offline_payment', {
        p_payment_id: payment.id,
        p_memo: payment.memo || null,
      });
      if (error) throw error;
      await loadPayments();
    } catch (error: any) {
      alert(error?.message || '수납 완료 처리에 실패했습니다.');
    } finally {
      setProcessingId(null);
    }
  };

  const cancelPayment = async (payment: OfflinePayment) => {
    if (!confirm(`${payment.user_name}님의 현장결제 요청을 취소할까요?`)) return;
    setProcessingId(payment.id);
    try {
      const { error } = await supabase.rpc('cancel_scheduled_offline_payment', {
        p_payment_id: payment.id,
      });
      if (error) throw error;
      await loadPayments();
    } catch (error: any) {
      alert(error?.message || '현장결제 요청 취소에 실패했습니다.');
    } finally {
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
              const processing = processingId === payment.id;
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
                  {payment.status === 'scheduled' && (
                    <div className="flex gap-2 lg:ml-3">
                      <button disabled={processing} onClick={() => void cancelPayment(payment)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-500 disabled:opacity-50"><XCircle size={15} /> 취소</button>
                      <button disabled={processing} onClick={() => void confirmPayment(payment)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 size={15} /> 수납 완료</button>
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
