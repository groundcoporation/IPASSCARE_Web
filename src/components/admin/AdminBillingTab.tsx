import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CreditCard, Calendar, Plus, RefreshCw, CheckCircle2, AlertCircle, FileText, Loader2, ListFilter, Users, ArrowRight } from 'lucide-react';

interface Bill {
  id: string;
  branch_id: string;
  student_id: string;
  class_schedule_id: string;
  bill_month: string;
  amount_due: number;
  amount_paid: number;
  billing_date: string;
  payment_date: string | null;
  payment_method: string | null;
  status: string; // unpaid, paid, refunded
  memo: string | null;
  academy_students: {
    student_name: string;
    parent_user_id: string | null;
  } | null;
  class_schedules: {
    target_class: string;
    package_option_id: string | null;
  } | null;
  package_options?: {
    label: string;
    price: number;
    packages?: {
      name: string;
    } | null;
  } | null;
}

interface StudentClassRow {
  id: string;
  student_id: string;
  class_schedule_id: string;
  package_option_id: string | null;
  billing_cycle: string | null;
  payment_day: string | null;
  status: string;
  registered_at: string;
  academy_students: {
    student_name: string;
    parent_user_id: string | null;
    branch_id: string;
    is_sms_enabled: boolean;
  } | null;
  class_schedules: {
    target_class: string;
  } | null;
  package_options: {
    label: string;
    price: number;
    packages: {
      name: string;
    } | null;
  } | null;
}

interface AdminBillingTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
}

export const AdminBillingTab: React.FC<AdminBillingTabProps> = ({ activeBranchId, branches }) => {
  const [subTab, setSubTab] = useState<'targets' | 'invoices'>('targets'); // Sub-menu toggle
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Tab 1: Billing Targets data
  const [billingTargets, setBillingTargets] = useState<StudentClassRow[]>([]);

  // Tab 2: Invoices data
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  // Manual payment modal state
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // cash, offline_card, bank_transfer
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMemo, setPaymentMemo] = useState('');

  // Load Billing Targets
  const loadBillingTargets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('academy_student_classes')
        .select(`
          id,
          student_id,
          class_schedule_id,
          package_option_id,
          billing_cycle,
          payment_day,
          status,
          registered_at,
          academy_students(student_name, parent_user_id, branch_id, is_sms_enabled),
          class_schedules(target_class),
          package_options(
            label,
            price,
            packages(name)
          )
        `)
        .eq('status', 'active');

      if (!error && data) {
        // Filter by branch
        const filtered = (data as any[]).filter(row => {
          if (!activeBranchId || activeBranchId === 'all') return true;
          return row.academy_students?.branch_id === activeBranchId;
        });
        setBillingTargets(filtered as StudentClassRow[]);
      } else {
        setBillingTargets([]);
      }
    } catch (err) {
      console.error('Error loading billing targets:', err);
      setBillingTargets([]);
    } finally {
      setLoading(false);
    }
  };

  // Load Bills
  const loadBills = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('academy_bills')
        .select(`
          *,
          academy_students(student_name, parent_user_id),
          class_schedules(target_class),
          package_options:package_option_id(
            label,
            price,
            packages(name)
          )
        `)
        .eq('bill_month', selectedMonth);
      
      if (activeBranchId && activeBranchId !== 'all') {
        query = query.eq('branch_id', activeBranchId);
      }

      const { data, error } = await query;
      if (!error && data) {
        setBills(data as any[]);
      } else {
        setBills([]);
      }
    } catch (err) {
      console.error('Error loading bills:', err);
      setBills([]);
    } finally {
      setLoading(false);
    }
  };

  // Switch loading states
  useEffect(() => {
    if (subTab === 'targets') {
      loadBillingTargets();
    } else {
      loadBills();
    }
  }, [activeBranchId, subTab, selectedMonth]);

  // Generate Invoices for all active students in the selected month
  const handleGenerateBills = async () => {
    const currentBranch = activeBranchId || (branches.length > 0 ? branches[0].id : '');
    if (!currentBranch || currentBranch === 'all') {
      alert('지점을 먼저 선택해주세요. (상단 지점 필터에서 특정 지점을 선택해야 청구서 일괄 발행이 가능합니다.)');
      return;
    }

    if (!confirm(`${branches.find(b => b.id === currentBranch)?.name} 지점의 모든 수강 학생을 대상으로 [${selectedMonth}월분] 청구 고지서를 일괄 발행하시겠습니까?\n이미 발행된 청구서가 있을 경우 중복 발행되지 않고 건너뜁니다.`)) {
      return;
    }

    setActionLoading(true);
    try {
      // Load current branch mapping
      const { data: mappings, error: mErr } = await supabase
        .from('academy_student_classes')
        .select(`
          student_id,
          class_schedule_id,
          package_option_id,
          status,
          academy_students(student_name, parent_user_id, branch_id),
          class_schedules(target_class),
          package_options(
            id,
            label,
            price,
            packages(name)
          )
        `)
        .eq('status', 'active');

      if (mErr) throw mErr;

      const branchMappings = (mappings as any[] || []).filter(
        m => m.academy_students?.branch_id === currentBranch
      );

      if (branchMappings.length === 0) {
        alert('이 지점에 현재 수강중(active) 상태인 학생 배정 내역이 없습니다. 학생 관리 탭에서 학생을 반에 먼저 배정해 주세요.');
        setActionLoading(false);
        return;
      }

      let createdCount = 0;
      let skippedCount = 0;

      for (const map of branchMappings) {
        // Skip if no package option is linked to this student class mapping
        if (!map.package_option_id || !map.package_options) {
          skippedCount++;
          continue;
        }

        const price = map.package_options.price;
        const className = map.class_schedules?.target_class || '수강반';
        const packageName = map.package_options.packages?.name || '수강료';

        // Check if invoice already exists
        const { data: existing } = await supabase
          .from('academy_bills')
          .select('id')
          .eq('student_id', map.student_id)
          .eq('class_schedule_id', map.class_schedule_id)
          .eq('bill_month', selectedMonth)
          .limit(1);

        if (existing && existing.length > 0) {
          skippedCount++;
          continue; // Skip
        }

        // Create bill
        const { error: insErr } = await supabase
          .from('academy_bills')
          .insert([{
            branch_id: currentBranch,
            student_id: map.student_id,
            class_schedule_id: map.class_schedule_id,
            bill_month: selectedMonth,
            amount_due: price,
            amount_paid: 0,
            billing_date: new Date().toISOString().slice(0, 10),
            status: 'unpaid',
            memo: `${packageName} (${map.package_options.label}) - ${className}`
          }]);

        if (!insErr) {
          createdCount++;
        }
      }

      alert(`청구서 생성 완료!\n- 새 청구서 발행: ${createdCount}건\n- 기존 발행 또는 요금제 미지정 건너뜀: ${skippedCount}건`);
      setSubTab('invoices');
      loadBills();
    } catch (err: any) {
      alert(`청구서 발행 실패: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Pay Modal
  const openPayModal = (bill: Bill) => {
    setSelectedBill(bill);
    setPaymentMethod('cash');
    setPaidAmount(String(bill.amount_due));
    setPaymentMemo('');
    setIsPayModalOpen(true);
  };

  // Process manual payment
  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;
    const amount = Number(paidAmount);
    if (isNaN(amount) || amount <= 0) return alert('정확한 수납 금액을 입력해주세요.');

    setActionLoading(true);
    try {
      const nowStr = new Date().toISOString();
      const currentBranch = activeBranchId || selectedBill.branch_id;

      // 1. Update bill status
      const { error: billErr } = await supabase
        .from('academy_bills')
        .update({
          status: 'paid',
          amount_paid: amount,
          payment_method: paymentMethod,
          payment_date: nowStr,
          memo: paymentMemo.trim() || selectedBill.memo
        })
        .eq('id', selectedBill.id);

      if (billErr) throw billErr;

      // 2. Insert into `payments` table to sync with ledger statistics
      const paymentId = crypto.randomUUID();
      const { error: payErr } = await supabase
        .from('payments')
        .insert([{
          id: paymentId,
          created_at: nowStr,
          total_amount: amount,
          final_amount: amount,
          payment_method: paymentMethod.toUpperCase(),
          status: 'success',
          pg_tid: `OFFLINE_${paymentMethod.toUpperCase()}_${Date.now().toString().slice(-6)}`,
          branch_id: currentBranch,
          user_id: selectedBill.academy_students?.parent_user_id || null
        }]);

      if (!payErr) {
        // 3. Insert into `user_packages` to link purchase details
        const packageName = selectedBill.package_options?.packages?.name || '수강료 고지서';
        const label = selectedBill.package_options?.label || '수강반';

        await supabase
          .from('user_packages')
          .insert([{
            payment_id: paymentId,
            user_id: selectedBill.academy_students?.parent_user_id || null,
            package_name: `${packageName} (${label})`,
            price: amount,
            status: 'active',
            branch_id: currentBranch,
            total_count: 9999,
            remaining_count: 9999
          }]);
      }

      setIsPayModalOpen(false);
      loadBills();
    } catch (err: any) {
      alert(`수기 수납 처리에 실패했습니다: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Filter bills
  const filteredBills = bills.filter((b) => {
    if (statusFilter === 'all') return true;
    return b.status === statusFilter;
  });

  // Calculate sums
  const stats = React.useMemo(() => {
    const totalDue = bills.reduce((sum, b) => sum + b.amount_due, 0);
    const totalPaid = bills.reduce((sum, b) => sum + (b.status === 'paid' ? b.amount_paid : 0), 0);
    const totalUnpaid = totalDue - totalPaid;
    const rate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
    
    return { totalDue, totalPaid, totalUnpaid, rate };
  }, [bills]);

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            💳 교습비 및 수납 통합 관리
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            학생에게 매핑된 요금제를 기반으로 매월 청구 대상을 확인하고 온·오프라인 수납 상태를 장부에 동기화합니다.
          </p>
        </div>

        {/* Sub-menu Toggle Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-center">
          <button 
            onClick={() => setSubTab('targets')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              subTab === 'targets' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            👥 청구대상 관리 (기본 배정)
          </button>
          <button 
            onClick={() => setSubTab('invoices')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              subTab === 'invoices' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            📋 청구내역 조회 & 수납
          </button>
        </div>
      </div>

      {/* RENDER VIEW 1: BILLING TARGETS (👥 청구대상 관리) */}
      {subTab === 'targets' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-blue-50 border border-blue-100/60 p-4 rounded-2xl">
            <div className="text-xs text-blue-800 font-medium">
              💡 <b>청구대상 관리:</b> 학원에 재학 중인 원생들의 수업반 요금 배정 장부입니다. <br />
              매월 초 우측의 버튼을 통해 청구 대상을 기준으로 이번 달 청구서를 일괄 발행할 수 있습니다.
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 bg-white"
              />
              <button 
                onClick={handleGenerateBills}
                disabled={actionLoading}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2 text-xs font-black shadow-sm shrink-0"
              >
                {actionLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                {selectedMonth.slice(5)}월 고지서 발행
              </button>
            </div>
          </div>

          {/* Always render table structure so column headers show even when empty */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-500">
                <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-6 py-4">클래스</th>
                    <th scope="col" className="px-6 py-4">이름</th>
                    <th scope="col" className="px-6 py-4">기간 방식</th>
                    <th scope="col" className="px-6 py-4">수납 일자</th>
                    <th scope="col" className="px-6 py-4">사전 발송</th>
                    <th scope="col" className="px-6 py-4">교습비</th>
                    <th scope="col" className="px-6 py-4">내역 생성</th>
                    <th scope="col" className="px-6 py-4">자동 발송</th>
                    <th scope="col" className="px-6 py-4">중복 수강</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16">
                        <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                        <span className="text-xs font-bold text-slate-400 block mt-2">청구 대상 목록 조회 중...</span>
                      </td>
                    </tr>
                  ) : billingTargets.length > 0 ? (
                    billingTargets.map((row) => {
                      const className = row.class_schedules?.target_class || '수강반';
                      const studentName = row.academy_students?.student_name || '원생';
                      const isSmsEnabled = row.academy_students?.is_sms_enabled !== false;
                      const price = row.package_options ? `${row.package_options.price.toLocaleString()}원` : '단가 미지정';
                      
                      // Check for duplicates
                      const duplicateCount = billingTargets.filter(t => t.student_id === row.student_id).length;
                      
                      return (
                        <tr key={row.id} className="hover:bg-slate-50 text-slate-700 font-bold">
                          <td className="px-6 py-4 text-xs font-black text-slate-900">{className}</td>
                          <td className="px-6 py-4">{studentName}</td>
                          <td className="px-6 py-4 text-xs text-slate-500">{row.billing_cycle || '월 기간제'}</td>
                          <td className="px-6 py-4 text-xs text-slate-500">{row.payment_day || '매월 1일'}</td>
                          <td className="px-6 py-4 text-xs text-slate-400 font-medium">없음</td>
                          <td className="px-6 py-4 text-blue-600 font-extrabold">₩ {price}</td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-400">
                            <span className="flex items-center gap-1">
                              {selectedMonth}-01 청구예정
                              <ArrowRight size={10} className="text-slate-300" />
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] ${
                              isSmsEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                            }`}>
                              {isSmsEnabled ? '발송' : '미발송'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {duplicateCount > 1 ? (
                              <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                                중복수강 ({duplicateCount}개)
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center py-20 text-slate-400 font-bold text-sm bg-slate-50/30">
                        배정된 청구 대상이 없습니다. [학생 관리] 탭에서 학생을 등록하고 반과 요금제를 매핑해 주세요!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* RENDER VIEW 2: BILLS LEDGER (📋 청구내역 조회 및 수납) */
        <div className="space-y-6">
          {/* Stats Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <p className="text-[10px] font-black text-slate-400 tracking-wider">총 청구액</p>
              <h3 className="text-lg font-black text-slate-900 mt-1">{stats.totalDue.toLocaleString()}원</h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <p className="text-[10px] font-black text-emerald-500 tracking-wider">수납 완료</p>
              <h3 className="text-lg font-black text-emerald-600 mt-1">{stats.totalPaid.toLocaleString()}원</h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <p className="text-[10px] font-black text-rose-500 tracking-wider">미납 잔액</p>
              <h3 className="text-lg font-black text-rose-600 mt-1">{stats.totalUnpaid.toLocaleString()}원</h3>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
              <p className="text-[10px] font-black text-blue-500 tracking-wider">이번 달 수납율</p>
              <h3 className="text-lg font-black text-blue-600 mt-1">{stats.rate}%</h3>
            </div>
          </div>

          <div className="flex items-center justify-between">
            {/* Filter Toolbar */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-64">
              <button 
                onClick={() => setStatusFilter('all')}
                className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg ${
                  statusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                전체
              </button>
              <button 
                onClick={() => setStatusFilter('paid')}
                className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg ${
                  statusFilter === 'paid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                완납
              </button>
              <button 
                onClick={() => setStatusFilter('unpaid')}
                className={`flex-1 text-center py-1.5 text-xs font-bold rounded-lg ${
                  statusFilter === 'unpaid' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                미납
              </button>
            </div>

            <div className="text-xs text-slate-400 font-bold">
              기준 월: {selectedMonth.slice(0, 4)}년 {selectedMonth.slice(5)}월
            </div>
          </div>

          {/* Always render table structure so column headers show even when empty */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm text-slate-500">
                <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-6 py-4">원생명</th>
                    <th scope="col" className="px-6 py-4">수업반 (요금제 명칭)</th>
                    <th scope="col" className="px-6 py-4">청구액</th>
                    <th scope="col" className="px-6 py-4">실 수납액</th>
                    <th scope="col" className="px-6 py-4">수납 수단</th>
                    <th scope="col" className="px-6 py-4">최종 처리일</th>
                    <th scope="col" className="px-6 py-4">상태</th>
                    <th scope="col" className="px-6 py-4 text-right">수납 처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16">
                        <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                        <span className="text-xs font-bold text-slate-400 block mt-2">고지 정보 및 수납 목록 조회 중...</span>
                      </td>
                    </tr>
                  ) : filteredBills.length > 0 ? (
                    filteredBills.map((bill) => {
                      const studentName = bill.academy_students?.student_name || '원생';
                      const className = bill.class_schedules?.target_class || '수강반';
                      const packageLabel = bill.package_options
                        ? `[${bill.package_options.packages?.name || ''}] ${bill.package_options.label}`
                        : bill.memo || '수강 정보 연동 안 됨';
                      
                      const isPaid = bill.status === 'paid';
                      
                      // Method display
                      const methodText: Record<string, string> = {
                        app_card: '어플 카드결제',
                        app_vbank: '어플 가상계좌',
                        offline_card: '현장 카드',
                        cash: '현금 수납',
                        bank_transfer: '계좌 이체'
                      };
                      
                      return (
                        <tr key={bill.id} className="hover:bg-slate-50 font-bold text-slate-700">
                          <td className="px-6 py-4 font-extrabold text-slate-900">{studentName}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-700 text-xs">{className}</span>
                              <span className="text-[10px] text-slate-400 font-semibold">{packageLabel}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-800">{bill.amount_due.toLocaleString()}원</td>
                          <td className="px-6 py-4 text-slate-800">
                            {isPaid ? `${bill.amount_paid.toLocaleString()}원` : '-'}
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {bill.payment_method ? (
                              <span className="text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                {methodText[bill.payment_method] || bill.payment_method}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium">
                            {bill.payment_date ? new Date(bill.payment_date).toLocaleDateString('ko-KR') : '-'}
                          </td>
                          <td className="px-6 py-4">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full border border-emerald-100">
                                <CheckCircle2 size={12} />
                                완납
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] bg-rose-50 text-rose-700 font-bold px-2.5 py-1 rounded-full border border-rose-100">
                                <AlertCircle size={12} />
                                미납
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!isPaid && (
                              <button
                                onClick={() => openPayModal(bill)}
                                className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs"
                              >
                                수기 수납 완료
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-center py-20 text-slate-400 font-bold text-sm bg-slate-50/30">
                        이번 달 생성된 수납 고지서가 없습니다. 좌측 [청구대상 관리] 서브탭에서 이번 달 고지서를 일괄 발행해 주세요!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Modal */}
      {isPayModalOpen && selectedBill && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => setIsPayModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  OFFLINE PAYMENT PROCESS
                </span>
                <h3 className="mt-2 text-xl font-black text-slate-900">
                  {selectedBill.academy_students?.student_name} 원생 수기 수납 처리
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  어플 결제 이외에 학원 현장에서 결제 처리 완료된 수기 내역을 장부에 저장합니다.
                </p>
              </div>
              <button onClick={() => setIsPayModalOpen(false)} className="rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-black text-slate-600">닫기</button>
            </div>

            <form onSubmit={handleProcessPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">청구액</label>
                <input 
                  type="text" 
                  value={`${selectedBill.amount_due.toLocaleString()}원`}
                  disabled
                  className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm font-black border border-slate-100 text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">수납 구분 선택 *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cash', label: '💵 현금' },
                    { id: 'offline_card', label: '💳 현장 카드' },
                    { id: 'bank_transfer', label: '🏦 계좌 이체' }
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setPaymentMethod(item.id)}
                      className={`py-3 text-center text-xs font-bold rounded-xl border transition-all ${
                        paymentMethod === item.id 
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs' 
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">실 수납 금액 (원) *</label>
                <input 
                  type="number" 
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">비고 / 비회원 입금자명 메모</label>
                <textarea 
                  placeholder="예: 어머니 현금 수납 처리함"
                  value={paymentMemo}
                  onChange={(e) => setPaymentMemo(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button 
                type="submit" 
                disabled={actionLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3.5 text-sm font-black text-white hover:bg-slate-900 disabled:bg-slate-400 shadow-sm mt-6"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                수기 수납 완료 승인하기
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
