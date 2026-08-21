import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CreditCard, Calendar, Plus, RefreshCw, CheckCircle2, AlertCircle, FileText, Loader2, ListFilter, Users, ArrowRight } from 'lucide-react';

interface Bill {
  id: string;
  branch_id: string;
  student_id: string;
  class_schedule_id: string | null;
  package_option_id: string | null;
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
    child_id: string | null;
    child?: {
      deleted_at: string | null;
    } | null;
    parent?: {
      status: string;
    } | null;
  } | null;
  class_schedules: {
    target_class: string;
  } | null;
  package_options?: {
    label: string;
    price: number;
    packages?: {
      name: string;
    } | null;
  } | null;
  onsite_payments?: OfflinePayment[];
}

interface OfflinePayment {
  id: string;
  academy_bill_id: string;
  final_amount: number;
  payment_method: string;
  status: 'scheduled' | 'paid' | 'cancelled';
  scheduled_at: string | null;
  paid_at: string | null;
  memo: string | null;
  user_id?: string | null;
  total_amount?: number;
  user_name?: string;
  username?: string;
}

interface StudentClassRow {
  id: string;
  student_id: string;
  class_schedule_id: string | null;
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
    child_id: string | null;
    child?: {
      deleted_at: string | null;
    } | null;
    parent?: {
      status: string;
    } | null;
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
  const [directOnsitePayments, setDirectOnsitePayments] = useState<OfflinePayment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  // Manual payment modal state
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // cash, offline_card, bank_transfer
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMemo, setPaymentMemo] = useState('');
  const [paymentTiming, setPaymentTiming] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState(new Date().toISOString().slice(0, 10));

  // Billing is package-based. Multiple class schedules linked to the same
  // student/package are presented and billed as one tuition item.
  const billingTargetStudents = useMemo(() => {
    const students = new Map<string, {
      studentId: string;
      studentName: string;
      isSmsEnabled: boolean;
      packages: Array<{ row: StudentClassRow; classNames: string[] }>;
    }>();

    billingTargets.forEach((row) => {
      const studentId = row.student_id;
      const student = students.get(studentId) || {
        studentId,
        studentName: row.academy_students?.student_name || '원생',
        isSmsEnabled: row.academy_students?.is_sms_enabled !== false,
        packages: [],
      };
      const packageKey = row.package_option_id || `mapping:${row.id}`;
      let packageGroup = student.packages.find((item) =>
        (item.row.package_option_id || `mapping:${item.row.id}`) === packageKey
      );
      if (!packageGroup) {
        packageGroup = { row, classNames: [] };
        student.packages.push(packageGroup);
      }
      const className = row.class_schedules?.target_class || '이용권 단독';
      if (!packageGroup.classNames.includes(className)) packageGroup.classNames.push(className);
      students.set(studentId, student);
    });

    return Array.from(students.values());
  }, [billingTargets]);

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
          academy_students(
            student_name,
            parent_user_id,
            branch_id,
            is_sms_enabled,
            child_id,
            child:children(deleted_at),
            parent:users(status)
          ),
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
          const student = row.academy_students;
          if (!student || (student.child_id && student.child?.deleted_at != null)) return false;
          if (student.parent_user_id && student.parent?.status === 'deleted') return false;
          if (!activeBranchId || activeBranchId === 'all') return true;
          return student.branch_id === activeBranchId;
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

  // Load Bills with Real-Time Payment Matching
  const loadBills = async () => {
    setLoading(true);
    try {
      // 1. Fetch bills for the selected month
      let query = supabase
        .from('academy_bills')
        .select(`
          *,
          academy_students(
            student_name,
            parent_user_id,
            child_id,
            child:children(deleted_at),
            parent:users(status)
          ),
          class_schedules(target_class),
          package_options(
            label,
            price,
            packages(name)
          )
        `)
        .eq('bill_month', selectedMonth);
      
      if (activeBranchId && activeBranchId !== 'all') {
        query = query.eq('branch_id', activeBranchId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (!error && data) {
        const activeStudentBills = (data as any[]).filter((bill) => {
          const student = bill.academy_students;
          return student
            && (!student.child_id || student.child?.deleted_at == null)
            && (!student.parent_user_id || student.parent?.status !== 'deleted');
        });
        setBills(activeStudentBills as Bill[]);
      } else {
        console.error('Error loading bills query:', error);
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
    const branchName = activeBranchId && activeBranchId !== 'all' 
      ? branches.find(b => b.id === activeBranchId)?.name || '해당'
      : '전체';

    if (!confirm(`${branchName} 지점의 모든 수강 학생을 대상으로 [${selectedMonth}월분] 청구 고지서를 일괄 발행하시겠습니까?\n이미 발행된 청구서가 있을 경우 중복 발행되지 않고 건너뜁니다.`)) {
      return;
    }

    setActionLoading(true);
    try {
      // 1. Fetch all package options independently
      const { data: allPkgOptions } = await supabase
        .from('package_options')
        .select('id, label, price, packages(name)');
      const pkgOptionMap = new Map<string, any>();
      (allPkgOptions || []).forEach((p: any) => pkgOptionMap.set(p.id, p));

      // 2. Load active mappings
      const { data: mappings, error: mErr } = await supabase
        .from('academy_student_classes')
        .select(`
          student_id,
          class_schedule_id,
          package_option_id,
          status,
          academy_students(
            student_name,
            parent_user_id,
            branch_id,
            child_id,
            child:children(deleted_at),
            parent:users(status)
          ),
          class_schedules(target_class)
        `)
        .eq('status', 'active');

      if (mErr) throw mErr;

      const branchMappings = (mappings as any[] || []).filter(
        m => (!activeBranchId || activeBranchId === 'all' || m.academy_students?.branch_id === activeBranchId)
          && (!m.academy_students?.child_id || m.academy_students?.child?.deleted_at == null)
          && (!m.academy_students?.parent_user_id || m.academy_students?.parent?.status !== 'deleted')
      );

      if (branchMappings.length === 0) {
        alert('현재 수강중(active) 상태인 학생 배정 내역이 없습니다. [학생 관리] 탭에서 학생을 등록하고 요금제를 먼저 배정해 주세요.');
        setActionLoading(false);
        return;
      }

      let createdCount = 0;
      let alreadyCount = 0;
      let failCount = 0;
      let lastErrMsg = '';

      const packageGroups = new Map<string, any[]>();
      for (const mapping of branchMappings) {
        const key = mapping.package_option_id
          ? `${mapping.student_id}:${mapping.package_option_id}`
          : `mapping:${mapping.student_id}:${mapping.class_schedule_id || 'none'}`;
        packageGroups.set(key, [...(packageGroups.get(key) || []), mapping]);
      }

      for (const maps of packageGroups.values()) {
        const map = maps[0];
        const pkgOpt = map.package_option_id ? pkgOptionMap.get(map.package_option_id) : null;
        const price = pkgOpt?.price || 0;
        const packageName = pkgOpt?.packages?.name || '수강료';
        const packageLabel = pkgOpt?.label || '기본 요금';
        const classNames: string[] = Array.from(new Set<string>(
          maps.map((item: any) => item.class_schedules?.target_class || '이용권 단독')
        ));
        const targetBranchId = map.academy_students?.branch_id || (branches.length > 0 ? branches[0].id : '');

        // A child may have multiple passes in the same month. De-duplicate by
        // the exact pass option instead of suppressing every later bill for
        // the same child.
        let existingQuery = supabase
          .from('academy_bills')
          .select('id')
          .eq('student_id', map.student_id)
          .eq('bill_month', selectedMonth);

        if (map.package_option_id) {
          existingQuery = existingQuery.eq('package_option_id', map.package_option_id);
        } else if (map.class_schedule_id) {
          existingQuery = existingQuery.is('package_option_id', null).eq('class_schedule_id', map.class_schedule_id);
        } else {
          existingQuery = existingQuery.is('package_option_id', null).is('class_schedule_id', null);
        }

        const { data: existing, error: existingError } = await existingQuery.limit(1);
        if (existingError) throw existingError;

        if (existing && existing.length > 0) {
          alreadyCount++;
          continue; // Already exists
        }

        // Create bill
        const billPayload: any = {
          branch_id: targetBranchId,
          student_id: map.student_id,
          class_schedule_id: maps.length === 1 ? (map.class_schedule_id || null) : null,
          package_option_id: map.package_option_id || null,
          bill_month: selectedMonth,
          amount_due: price,
          amount_paid: 0,
          billing_date: new Date().toISOString().slice(0, 10),
          status: 'unpaid',
          memo: `${packageName} (${packageLabel}) | 연결 수업: ${classNames.join(', ')}`
        };

        const { error: insErr } = await supabase
          .from('academy_bills')
          .insert([billPayload]);

        if (insErr) {
          console.error('Invoice insert error:', insErr);
          failCount++;
          lastErrMsg = insErr.message;
        } else {
          createdCount++;
        }
      }

      if (failCount > 0 && createdCount === 0) {
        alert(`청구서 DB 저장 중 오류가 발생했습니다:\n${lastErrMsg}`);
      } else {
        alert(`청구서 처리 완료!\n- 새로 발행된 청구서: ${createdCount}건\n- 이미 발행되어 건너뜀: ${alreadyCount}건\n\n[청구내역 조회] 탭으로 자동 이동합니다.`);
      }

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
    setPaymentTiming('now');
    setScheduledAt(new Date().toISOString().slice(0, 10));
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
      const methodMap: Record<string, string> = {
        cash: 'CASH',
        offline_card: 'OFFLINE_CARD',
        bank_transfer: 'OFFLINE_TRANSFER',
      };
      const { data: scheduledResult, error: scheduleError } = await supabase.rpc('schedule_offline_payment', {
        p_bill_id: selectedBill.id,
        p_amount: amount,
        p_payment_method: methodMap[paymentMethod],
        p_scheduled_at: new Date(`${scheduledAt}T12:00:00+09:00`).toISOString(),
        p_memo: paymentMemo.trim() || null,
      });
      if (scheduleError) throw scheduleError;

      if (paymentTiming === 'now') {
        const paymentId = scheduledResult?.payment_id;
        const { data: confirmedResult, error: confirmError } = await supabase.rpc('confirm_offline_payment', {
          p_payment_id: paymentId,
          p_memo: paymentMemo.trim() || null,
        });
        if (confirmError) throw confirmError;
        if (confirmedResult?.bill_status === 'paid' && !confirmedResult?.package_issued) {
          alert('수납은 완료됐지만 연결된 이용권 옵션을 찾지 못했습니다. 학생의 요금제 배정을 확인해 주세요.');
        }
      }

      setIsPayModalOpen(false);
      await loadBills();
    } catch (err: any) {
      alert(`수기 수납 처리에 실패했습니다: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const confirmScheduledPayment = async (payment: OfflinePayment) => {
    if (!confirm('현장에서 실제 수납한 것을 확인했나요? 완료 후 결제 포인트와 이용권이 처리됩니다.')) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('confirm_offline_payment', {
        p_payment_id: payment.id,
        p_memo: payment.memo,
      });
      if (error) throw error;
      if (data?.bill_status === 'paid' && !data?.package_issued) {
        alert('수납은 완료됐지만 연결된 이용권 옵션을 찾지 못했습니다. 학생의 요금제 배정을 확인해 주세요.');
      }
      await loadBills();
    } catch (err: any) {
      alert(`수납 완료 처리에 실패했습니다: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const cancelScheduledPayment = async (payment: OfflinePayment) => {
    if (!confirm('이 현장결제 예정 건을 취소할까요? 실제 결제 및 포인트에는 영향이 없습니다.')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('cancel_scheduled_offline_payment', {
        p_payment_id: payment.id,
      });
      if (error) throw error;
      await loadBills();
    } catch (err: any) {
      alert(`결제 예정 취소에 실패했습니다: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Filter bills
  const filteredBills = bills.filter((b) => {
    if (statusFilter === 'all') return true;
    return b.status === statusFilter;
  });

  const filteredBillStudents = useMemo(() => {
    const groups = new Map<string, { studentId: string; studentName: string; bills: Bill[] }>();
    filteredBills.forEach((bill) => {
      const current = groups.get(bill.student_id) || {
        studentId: bill.student_id,
        studentName: bill.academy_students?.student_name || '원생',
        bills: [],
      };
      current.bills.push(bill);
      groups.set(bill.student_id, current);
    });
    return Array.from(groups.values());
  }, [filteredBills]);

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
            📋 청구내역 조회
          </button>
        </div>
      </div>

      {/* RENDER VIEW 1: BILLING TARGETS (👥 청구대상 관리) */}
      {subTab === 'targets' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-blue-50 border border-blue-100/60 p-4 rounded-2xl">
            <div className="text-xs text-blue-800 font-medium">
              💡 <b>청구대상 관리:</b> 학원에 재학 중인 원생들의 수업반 요금 배정 장부입니다. <br />
              매월 초 우측의 버튼을 통해 청구 대상을 기준으로 이번 달 청구서를 일괄 발행할 수 있습니다. (수업반이 지정되지 않은 회원은 이용권 단독으로 청구됩니다.)
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
              <table className="w-full border-collapse text-left text-xs text-slate-600">
                <thead className="bg-slate-100/80 text-[11px] font-black uppercase text-slate-700 border-b border-slate-200">
                  <tr className="whitespace-nowrap">
                    <th scope="col" className="px-4 py-3.5 min-w-[140px]">연결 수업</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[150px]">이용권 요금제</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[100px] text-center">기간 방식</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[100px] text-center">수납 일자</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[90px] text-center">사전 발송</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[120px] text-right">교습비</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[140px] text-center">내역 생성</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[90px] text-center">자동 발송</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[100px] text-center">연결 수업 수</th>
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
                  ) : billingTargetStudents.length > 0 ? (
                    billingTargetStudents.map((student) => (
                      <React.Fragment key={student.studentId}>
                        <tr className="border-t border-slate-200 bg-blue-50/60">
                          <td colSpan={9} className="px-4 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <span className="font-black text-slate-900 text-sm">{student.studentName}</span>
                                <span className="ml-2 text-[11px] font-bold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-full">
                                  이용권 {student.packages.length}개
                                </span>
                              </div>
                              <span className="text-xs font-black text-slate-800">
                                예상 교습비 <b className="text-blue-600">{student.packages.reduce((sum, item) => sum + (item.row.package_options?.price || 0), 0).toLocaleString()}</b>원
                              </span>
                            </div>
                          </td>
                        </tr>
                        {student.packages.map(({ row, classNames }) => {
                          const packageName = row.package_options?.packages?.name || '수강료';
                          const packageLabel = row.package_options?.label || '요금제 미지정';
                          const price = row.package_options ? `${row.package_options.price.toLocaleString()}원` : '단가 미지정';
                          const dayNum = (row.payment_day || '1일').replace(/[^0-9]/g, '') || '01';
                          const formattedDay = dayNum.padStart(2, '0');
                          return (
                            <tr key={row.package_option_id || row.id} className="font-bold text-slate-700 hover:bg-slate-50 transition whitespace-nowrap">
                              <td className="px-4 py-3"><div className="flex max-w-xs flex-wrap gap-1">{classNames.map((className) => <span key={className} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 font-bold">{className}</span>)}</div></td>
                              <td className="px-4 py-3"><div className="text-xs font-black text-slate-900">{packageName}</div><div className="text-[10px] text-slate-400 font-medium">{packageLabel}</div></td>
                              <td className="px-4 py-3 text-xs text-slate-500 text-center font-medium">{row.billing_cycle || '월 기간제'}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 text-center font-medium">{row.payment_day || '매월 1일'}</td>
                              <td className="px-4 py-3 text-xs font-medium text-slate-400 text-center">없음</td>
                              <td className="px-4 py-3 font-black text-blue-600 text-right">₩ {price}</td>
                              <td className="px-4 py-3 text-xs font-medium text-slate-700 text-center"><span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded font-bold">{selectedMonth}-{formattedDay} 청구예정 <ArrowRight size={10} className="text-slate-400" /></span></td>
                              <td className="px-4 py-3 text-center"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${student.isSmsEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>{student.isSmsEnabled ? '발송' : '미발송'}</span></td>
                              <td className="px-4 py-3 text-center"><span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] text-indigo-700 font-black">{classNames.length}개 수업</span></td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center py-20 text-slate-400 font-bold text-xs bg-slate-50/30">
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
              <table className="w-full border-collapse text-left text-xs text-slate-600">
                <thead className="bg-slate-100/80 text-[11px] font-black uppercase text-slate-700 border-b border-slate-200">
                  <tr className="whitespace-nowrap">
                    <th scope="col" className="px-4 py-3.5 w-12 text-center">#</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[180px]">수업반 (요금제 명칭)</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[110px] text-right">청구액</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[110px] text-right">실 수납액</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[110px] text-center">수납 수단</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[110px] text-center">최종 처리일</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[90px] text-center">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                        <span className="text-xs font-bold text-slate-400 block mt-2">고지 정보 및 수납 목록 조회 중...</span>
                      </td>
                    </tr>
                  ) : filteredBillStudents.length > 0 ? (
                    filteredBillStudents.map((student) => (
                      <React.Fragment key={student.studentId}>
                        <tr className="border-t border-slate-200 bg-blue-50/60">
                          <td colSpan={7} className="px-4 py-2.5">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-black text-slate-900 text-sm">{student.studentName}</span>
                                <span className="ml-2 text-[11px] font-bold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-full">
                                  청구 이용권 {student.bills.length}개
                                </span>
                              </div>
                              <span className="text-xs font-black text-slate-800">
                                총 청구액 <b className="text-blue-600">{student.bills.reduce((sum, bill) => sum + bill.amount_due, 0).toLocaleString()}</b>원
                              </span>
                            </div>
                          </td>
                        </tr>
                        {student.bills.map((bill) => {
                          const className = bill.class_schedules?.target_class || '복수 수업 연결';
                          const packageLabel = bill.package_options ? `[${bill.package_options.packages?.name || ''}] ${bill.package_options.label}` : bill.memo || '수강 정보 연동 안 됨';
                          const isPaid = bill.status === 'paid';
                          const methodText: Record<string, string> = { app_card: '어플 카드결제', app_vbank: '어플 가상계좌', offline_card: '현장 카드', cash: '현금 수납', bank_transfer: '계좌 이체', offline_transfer: '현장 계좌이체' };
                          return (
                            <tr key={bill.id} className="font-bold text-slate-700 hover:bg-slate-50 transition whitespace-nowrap">
                              <td className="px-4 py-3 text-xs text-slate-300 text-center font-bold">└</td>
                              <td className="px-4 py-3"><div className="flex flex-col"><span className="text-xs font-black text-slate-800">{className}</span><span className="text-[10px] font-medium text-slate-400">{packageLabel}</span>{bill.memo?.includes('연결 수업:') && <span className="mt-0.5 text-[9px] text-indigo-500 font-bold">{bill.memo.split('|')[1]?.trim()}</span>}</div></td>
                              <td className="px-4 py-3 text-slate-800 font-bold text-right">{bill.amount_due.toLocaleString()}원</td>
                              <td className="px-4 py-3 text-slate-800 font-bold text-right">{isPaid ? `${bill.amount_paid.toLocaleString()}원` : '-'}</td>
                              <td className="px-4 py-3 text-xs text-center">{bill.payment_method ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 font-bold text-[11px]">{methodText[bill.payment_method] || bill.payment_method}</span> : '-'}</td>
                              <td className="px-4 py-3 text-xs font-medium text-slate-500 text-center">{bill.payment_date ? new Date(bill.payment_date).toLocaleDateString('ko-KR') : '-'}</td>
                              <td className="px-4 py-3 text-center">{isPaid ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-700"><CheckCircle2 size={11} /> 완납</span> : <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-0.5 text-[10px] font-black text-rose-700"><AlertCircle size={11} /> 미납</span>}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-20 text-slate-400 font-bold text-xs bg-slate-50/30">
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
                <label className="block text-xs font-bold text-slate-500 mb-1.5">처리 방식 *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPaymentTiming('now')} className={`rounded-xl border py-3 text-xs font-black transition ${paymentTiming === 'now' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>지금 수납 완료</button>
                  <button type="button" onClick={() => setPaymentTiming('scheduled')} className={`rounded-xl border py-3 text-xs font-black transition ${paymentTiming === 'scheduled' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-500'}`}>현장결제 예정</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">{paymentTiming === 'now' ? '수납일' : '결제 예정일'} *</label>
                <input type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>

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
                {paymentTiming === 'now' ? '현장 수납 완료 처리' : '현장결제 예정 등록'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
