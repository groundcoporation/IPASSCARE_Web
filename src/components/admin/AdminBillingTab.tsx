import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CreditCard, Calendar, Plus, RefreshCw, CheckCircle2, AlertCircle, FileText, Loader2, ListFilter, Users, ArrowRight, Search, Trash2 } from 'lucide-react';

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
  payment_request_id?: string | null;
  app_sent_at?: string | null;
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

interface OwnedPackageTarget {
  userPackageId: string;
  packageId: string | null;
  hasTargetMonthPackage: boolean;
  voucherType: string | null;
  studentId: string;
  studentName: string;
  branchId: string;
  childId: string | null;
  isSmsEnabled: boolean;
  optionId: string | null;
  packageName: string;
  optionLabel: string;
  price: number;
  billingCycle: string;
  paymentDay: string;
  classNames: string[];
  isShared?: boolean;
}

interface AdminBillingTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
}

interface TargetBillStatus {
  status: string;
  paymentRequestId: string | null;
}

const billingMonthByOffset = (offset: number) => {
  const date = new Date();
  return new Date(Date.UTC(date.getFullYear(), date.getMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
};

const billingMonthPeriod = (billMonth: string) => {
  const start = `${billMonth}-01`;
  const end = new Date(
    Date.UTC(Number(billMonth.slice(0, 4)), Number(billMonth.slice(5, 7)), 0),
  ).toISOString().slice(0, 10);
  return { start, end };
};

export const AdminBillingTab: React.FC<AdminBillingTabProps> = ({ activeBranchId, branches }) => {
  const [subTab, setSubTab] = useState<'targets' | 'invoices'>('targets'); // Sub-menu toggle
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Tab 1: Billing Targets data
  const [billingTargets, setBillingTargets] = useState<OwnedPackageTarget[]>([]);
  const [targetBillStatuses, setTargetBillStatuses] = useState<Record<string, TargetBillStatus>>({});
  const [selectedBillingStudentIds, setSelectedBillingStudentIds] = useState<Set<string>>(new Set());
  const [billingSearch, setBillingSearch] = useState('');

  // Tab 2: Invoices data
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedAppBillIds, setSelectedAppBillIds] = useState<Set<string>>(new Set());
  const [directOnsitePayments, setDirectOnsitePayments] = useState<OfflinePayment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [autoBillingEnabled, setAutoBillingEnabled] = useState(false);
  const [autoBillingSaving, setAutoBillingSaving] = useState(false);
  const [autoBillingLastRun, setAutoBillingLastRun] = useState<string | null>(null);
  const [autoBillingTargetStudentIds, setAutoBillingTargetStudentIds] = useState<Set<string>>(new Set());
  const [autoBillingTargetSaving, setAutoBillingTargetSaving] = useState(false);

  // Manual payment modal state
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // cash, offline_card, bank_transfer
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMemo, setPaymentMemo] = useState('');
  const [paymentTiming, setPaymentTiming] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState(new Date().toISOString().slice(0, 10));

  // The ledger must show passes actually owned by each child. Class mappings
  // are used only for the connected-class labels.
  const billingTargetStudents = useMemo(() => {
    const students = new Map<string, {
      studentId: string;
      studentName: string;
      isSmsEnabled: boolean;
      packages: OwnedPackageTarget[];
    }>();

    billingTargets.forEach((row) => {
      const studentId = row.studentId;
      const student = students.get(studentId) || {
        studentId,
        studentName: row.studentName,
        isSmsEnabled: row.isSmsEnabled,
        packages: [],
      };
      student.packages.push(row);
      students.set(studentId, student);
    });

    return Array.from(students.values()).sort((left, right) =>
      left.studentName.localeCompare(right.studentName, 'ko-KR')
    );
  }, [billingTargets]);

  const visibleBillingTargetStudents = useMemo(() => {
    const query = billingSearch.trim().toLowerCase();
    if (!query) return billingTargetStudents;
    return billingTargetStudents.filter((student) =>
      student.studentName.toLowerCase().includes(query)
      || student.packages.some((target) =>
        target.packageName.toLowerCase().includes(query)
        || target.optionLabel.toLowerCase().includes(query)
        || target.classNames.some((className) => className.toLowerCase().includes(query))
      )
    );
  }, [billingTargetStudents, billingSearch]);

  const billStatusKey = (target: OwnedPackageTarget, month = selectedMonth) =>
    `${target.studentId}:${target.optionId || 'none'}:${month}`;

  const isStudentAlreadyBilled = (student: (typeof billingTargetStudents)[number]) =>
    student.packages.length > 0
    && student.packages.every((target) =>
      target.hasTargetMonthPackage || (
        target.userPackageId.startsWith('plan:')
          ? Boolean(targetBillStatuses[billStatusKey(target)]?.status !== 'paid'
            && targetBillStatuses[billStatusKey(target)])
          : Boolean(targetBillStatuses[billStatusKey(target)])
      )
    );

  const selectableBillingStudents = visibleBillingTargetStudents.filter((student) => !isStudentAlreadyBilled(student));

  useEffect(() => {
    const availableIds = new Set(selectableBillingStudents.map((student) => student.studentId));
    setSelectedBillingStudentIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => availableIds.has(id)));
      if (next.size === previous.size && Array.from(next).every((id) => previous.has(id))) {
        return previous;
      }
      return next;
    });
  }, [billingTargetStudents, targetBillStatuses, selectedMonth]);

  const allBillingStudentsSelected = selectableBillingStudents.length > 0
    && selectableBillingStudents.every((student) => selectedBillingStudentIds.has(student.studentId));
  const allAutoBillingStudentsSelected = billingTargetStudents.length > 0
    && billingTargetStudents.every((student) => autoBillingTargetStudentIds.has(student.studentId));

  const toggleBillingStudent = (studentId: string) => {
    const student = billingTargetStudents.find((item) => item.studentId === studentId);
    if (!student || isStudentAlreadyBilled(student)) return;
    setSelectedBillingStudentIds((previous) => {
      const next = new Set(previous);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleAllBillingStudents = () => {
    setSelectedBillingStudentIds(
      allBillingStudentsSelected
        ? new Set()
        : new Set(selectableBillingStudents.map((student) => student.studentId)),
    );
  };

  const loadAutoBillingSetting = async () => {
    if (!activeBranchId || activeBranchId === 'all') {
      setAutoBillingEnabled(false);
      setAutoBillingLastRun(null);
      setAutoBillingTargetStudentIds(new Set());
      return;
    }
    const [settingResult, targetResult] = await Promise.all([
      supabase
        .from('academy_billing_automation_settings')
        .select('is_enabled, last_run_at')
        .eq('branch_id', activeBranchId)
        .maybeSingle(),
      supabase
        .from('academy_billing_automation_targets')
        .select('student_id')
        .eq('branch_id', activeBranchId)
        .eq('is_enabled', true),
    ]);
    if (settingResult.error || targetResult.error) {
      console.error('자동 청구 설정 조회 실패:', settingResult.error || targetResult.error);
      return;
    }
    setAutoBillingEnabled(Boolean(settingResult.data?.is_enabled));
    setAutoBillingLastRun(settingResult.data?.last_run_at || null);
    setAutoBillingTargetStudentIds(new Set((targetResult.data || []).map((row) => row.student_id)));
  };

  const saveAutoBillingTargets = async (studentIds: string[], enabled: boolean) => {
    if (!activeBranchId || activeBranchId === 'all' || autoBillingTargetSaving || studentIds.length === 0) return;
    setAutoBillingTargetSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error('로그인이 필요합니다.');
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('academy_billing_automation_targets')
        .upsert(studentIds.map((studentId) => ({
          branch_id: activeBranchId,
          student_id: studentId,
          is_enabled: enabled,
          updated_by: authData.user.id,
          updated_at: now,
        })), { onConflict: 'branch_id,student_id' });
      if (error) throw error;
      setAutoBillingTargetStudentIds((previous) => {
        const next = new Set(previous);
        studentIds.forEach((studentId) => enabled ? next.add(studentId) : next.delete(studentId));
        return next;
      });
    } catch (error: any) {
      alert(`자동 청구 대상 저장 실패: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      setAutoBillingTargetSaving(false);
    }
  };

  const toggleAutoBillingStudent = (studentId: string) => {
    void saveAutoBillingTargets([studentId], !autoBillingTargetStudentIds.has(studentId));
  };

  const toggleAllAutoBillingStudents = () => {
    void saveAutoBillingTargets(
      billingTargetStudents.map((student) => student.studentId),
      !allAutoBillingStudentsSelected,
    );
  };

  const toggleAutoBilling = async () => {
    if (!activeBranchId || activeBranchId === 'all' || autoBillingSaving) return;
    setAutoBillingSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error('로그인이 필요합니다.');
      const nextEnabled = !autoBillingEnabled;
      const { error } = await supabase
        .from('academy_billing_automation_settings')
        .upsert({
          branch_id: activeBranchId,
          is_enabled: nextEnabled,
          billing_day: 1,
          updated_by: authData.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'branch_id' });
      if (error) throw error;
      setAutoBillingEnabled(nextEnabled);
      alert(nextEnabled
        ? '자동 청구를 켰습니다. 매월 1일 미갱신 대상에게 앱 청구서가 자동 발송됩니다.'
        : '자동 청구를 껐습니다. 기존 청구서에는 영향을 주지 않습니다.');
    } catch (error: any) {
      alert(`자동 청구 설정 변경 실패: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      setAutoBillingSaving(false);
    }
  };

  // Load Billing Targets
  const loadBillingTargets = async () => {
    setLoading(true);
    try {
      const { data: students, error: studentError } = await supabase
        .from('academy_students')
        .select(`
          id,
          student_name,
          parent_user_id,
          branch_id,
          is_sms_enabled,
          child_id,
          child:children(deleted_at),
          parent:users(status),
          academy_student_classes(
            id,
            class_schedule_id,
            package_option_id,
            billing_cycle,
            payment_day,
            status,
            class_schedules(target_class),
            package_options(
              id,
              label,
              price,
              packages(name)
            )
          )
        `);
      if (studentError) throw studentError;

      const activeStudents = (students as any[] || []).filter((student) =>
        (!student.child_id || student.child?.deleted_at == null)
        && (!student.parent_user_id || student.parent?.status !== 'deleted')
        && (!activeBranchId || activeBranchId === 'all' || student.branch_id === activeBranchId)
      );
      const appStudents = activeStudents.filter((student) => Boolean(student.child_id));
      const webOnlyStudents = activeStudents.filter((student) => !student.child_id);
      const studentByChildId = new Map(appStudents.map((student) => [student.child_id, student]));
      const studentsByParentId = new Map<string, any[]>();
      activeStudents.forEach((student) => {
        if (!student.parent_user_id) return;
        const siblings = studentsByParentId.get(student.parent_user_id) || [];
        siblings.push(student);
        studentsByParentId.set(student.parent_user_id, siblings);
      });
      studentsByParentId.forEach((siblings) => siblings.sort((left, right) => String(left.id).localeCompare(String(right.id))));
      const selectedPeriod = billingMonthPeriod(selectedMonth);
      const { data: monthlyPlans, error: monthlyPlanError } = appStudents.length > 0
        ? await supabase
            .from('academy_student_monthly_plans')
            .select(`
              id,
              item_type,
              student_id,
              branch_id,
              class_schedule_id,
              package_option_id,
              billing_cycle,
              payment_day,
              class_schedules(target_class),
              package_options(id, label, price, packages(id, name, voucher_type))
            `)
            .eq('effective_month', selectedPeriod.start)
            .eq('status', 'planned')
            .in('student_id', appStudents.map((student) => student.id))
        : { data: [], error: null };
      if (monthlyPlanError) throw monthlyPlanError;

      // Resolve assignments effective during the selected billing month.
      // Future-dated assignments must not leak into the current month.
      const childIds = appStudents.map((student) => student.child_id).filter(Boolean);
      const parentUserIds = Array.from(new Set(
        activeStudents.map((student) => student.parent_user_id).filter(Boolean),
      ));
      const { data: appAssignments, error: assignmentError } = childIds.length > 0
        ? await supabase
            .from('student_schedule_assignments')
            .select('child_id, schedule_id, starts_on, ends_on, is_active, class_schedules:schedule_id(target_class)')
            .eq('is_active', true)
            .lte('starts_on', selectedPeriod.end)
            .or(`ends_on.is.null,ends_on.gte.${selectedPeriod.start}`)
            .in('child_id', childIds)
        : { data: [], error: null };
      if (assignmentError) throw assignmentError;

      const appClassNamesByChildId = new Map<string, string[]>();
      (appAssignments as any[] || [])
        .forEach((assignment) => {
          const className = assignment.class_schedules?.target_class;
          if (!assignment.child_id || !className) return;
          const names = appClassNamesByChildId.get(assignment.child_id) || [];
          if (!names.includes(className)) names.push(className);
          appClassNamesByChildId.set(assignment.child_id, names);
        });

      const previousMonthDate = new Date(Date.UTC(
        Number(selectedMonth.slice(0, 4)),
        Number(selectedMonth.slice(5, 7)) - 2,
        1,
      ));
      const previousMonth = previousMonthDate.toISOString().slice(0, 7);
      const previousPeriod = billingMonthPeriod(previousMonth);
      const { data: ownedPackages, error: packageError } = await supabase
        .from('user_packages')
        .select('id, child_id, package_id, option_id, package_name, price, voucher_type, status, valid_from, valid_until, expiry_date, created_at')
        .in('status', ['active', 'expired', 'exhausted'])
        .not('child_id', 'is', null)
        .in('child_id', childIds)
        .or(`valid_from.is.null,valid_from.lte.${selectedPeriod.end}`);
      if (packageError) throw packageError;

      // A vehicle pass may intentionally be issued to the parent as a shared
      // package. Fetch only shared shuttle passes here; other shared lesson,
      // single-item, bundle, and GPS products must stay out of tuition billing.
      const { data: sharedShuttlePackages, error: sharedPackageError } = parentUserIds.length > 0
        ? await supabase
            .from('user_packages')
            .select('id, user_id, child_id, branch_id, package_id, option_id, package_name, price, voucher_type, status, valid_from, valid_until, expiry_date, created_at')
            .in('status', ['active', 'expired', 'exhausted'])
            .is('child_id', null)
            .eq('voucher_type', 'shuttle')
            .in('user_id', parentUserIds)
            .or(`valid_from.is.null,valid_from.lte.${selectedPeriod.end}`)
        : { data: [], error: null };
      if (sharedPackageError) throw sharedPackageError;

      const allOwnedPackages = [
        ...(ownedPackages as any[] || []),
        ...(sharedShuttlePackages as any[] || []),
      ];
      const optionIds = Array.from(new Set(allOwnedPackages
        .map((item) => item.option_id)
        .filter(Boolean)));
      const { data: options, error: optionError } = optionIds.length > 0
        ? await supabase
            .from('package_options')
            .select('id, label, price, packages(name)')
            .in('id', optionIds)
        : { data: [], error: null };
      if (optionError) throw optionError;
      const optionById = new Map((options as any[] || []).map((option) => [option.id, option]));

      // Child-linked paid products are billing targets regardless of whether
      // they are lessons, shuttle passes, or one-off products. GPS/family
      // shared products are not child tuition and stay out of this ledger.
      const billablePackages = (ownedPackages as any[] || [])
        .filter((owned) => owned.voucher_type !== 'gps');
      const packagesByChildAndProduct = new Map<string, any[]>();
      billablePackages.forEach((owned) => {
        const productKey = owned.package_id || owned.option_id || owned.package_name || owned.id;
        const key = `${owned.child_id}:${productKey}`;
        packagesByChildAndProduct.set(key, [...(packagesByChildAndProduct.get(key) || []), owned]);
      });

      const packageEnd = (owned: any) => owned.valid_until || owned.expiry_date || null;
      const overlaps = (owned: any, period: { start: string; end: string }) => {
        const start = owned.valid_from || null;
        const end = packageEnd(owned);
        return Boolean(start || end)
          && (!start || start <= period.end)
          && (!end || end >= period.start);
      };
      const newestFirst = (left: any, right: any) => {
        const leftDate = packageEnd(left) || left.valid_from || left.created_at || '';
        const rightDate = packageEnd(right) || right.valid_from || right.created_at || '';
        return rightDate.localeCompare(leftDate);
      };

      const appTargets: OwnedPackageTarget[] = Array.from(packagesByChildAndProduct.values())
        .map((ownedGroup) => {
          const targetMonthPackage = ownedGroup
            .filter((owned) => overlaps(owned, selectedPeriod))
            .sort(newestFirst)[0];
          const renewalSourcePackage = ownedGroup
            .filter((owned) => overlaps(owned, previousPeriod)
              || (!owned.valid_from && !packageEnd(owned) && owned.status === 'active'))
            .sort(newestFirst)[0];
          const owned = targetMonthPackage || renewalSourcePackage;
          if (!owned) return null;
          const student: any = studentByChildId.get(owned.child_id);
          if (!student) return null;
          const activeClasses = (student.academy_student_classes || [])
            .filter((mapping: any) => mapping.status === 'active');
          const option: any = owned.option_id ? optionById.get(owned.option_id) : null;
          const billingConfig = activeClasses.find((mapping: any) => (
            mapping.package_option_id === owned.option_id
          )) || activeClasses[0];
          return {
            userPackageId: owned.id,
            packageId: owned.package_id || null,
            hasTargetMonthPackage: Boolean(targetMonthPackage),
            voucherType: owned.voucher_type || 'lesson',
            studentId: student.id,
            studentName: student.student_name || '원생',
            branchId: student.branch_id,
            childId: student.child_id,
            isSmsEnabled: student.is_sms_enabled !== false,
            optionId: owned.option_id,
            packageName: option?.packages?.name || owned.package_name || '수강료',
            optionLabel: option?.label || (owned.option_id ? '요금제 정보 없음' : '옵션 미지정'),
            price: Number(owned.price ?? option?.price ?? 0),
            billingCycle: billingConfig?.billing_cycle || '월 기간제',
            paymentDay: billingConfig?.payment_day || '매월 1일',
            classNames: appClassNamesByChildId.get(student.child_id) || [],
          } satisfies OwnedPackageTarget;
        })
        .filter((target): target is OwnedPackageTarget => target !== null);

      const plannedRows = monthlyPlans as any[] || [];
      const plannedClassNamesByStudent = new Map<string, string[]>();
      plannedRows.filter((plan) => plan.item_type === 'class').forEach((plan) => {
        const className = plan.class_schedules?.target_class;
        if (!className) return;
        const names = plannedClassNamesByStudent.get(plan.student_id) || [];
        if (!names.includes(className)) names.push(className);
        plannedClassNamesByStudent.set(plan.student_id, names);
      });

      const plannedTargetsByStudentAndOption = new Map<string, OwnedPackageTarget>();
      plannedRows.filter((plan) => plan.item_type === 'package').forEach((plan) => {
        const student = activeStudents.find((item) => item.id === plan.student_id);
        const option = plan.package_options;
        if (!student || !option) return;
        const key = `${plan.student_id}:${plan.package_option_id}`;
        const existing = plannedTargetsByStudentAndOption.get(key);
        if (existing) return;
        plannedTargetsByStudentAndOption.set(key, {
          userPackageId: `plan:${plan.id}`,
          packageId: option.packages?.id || null,
          hasTargetMonthPackage: false,
          voucherType: option.packages?.voucher_type || 'lesson',
          studentId: student.id,
          studentName: student.student_name || '원생',
          branchId: student.branch_id,
          childId: student.child_id,
          isSmsEnabled: student.is_sms_enabled !== false,
          optionId: plan.package_option_id,
          packageName: option.packages?.name || '수강료',
          optionLabel: option.label || '요금제 정보 없음',
          price: Number(option.price || 0),
          billingCycle: plan.billing_cycle || '월 기간제',
          paymentDay: plan.payment_day || '매월 1일',
          classNames: plannedClassNamesByStudent.get(plan.student_id) || [],
        });
      });
      const plannedTargets = Array.from(plannedTargetsByStudentAndOption.values());
      const plannedStudentIds = new Set(plannedTargets.map((target) => target.studentId));

      // Shared vehicle passes are shown once per parent. academy_bills still
      // requires a student_id, so use a stable representative student only as
      // the bill recipient while clearly marking the package as family-shared.
      const sharedPackagesByParentAndProduct = new Map<string, any[]>();
      (sharedShuttlePackages as any[] || []).forEach((owned) => {
        const productKey = owned.package_id || owned.option_id || owned.package_name || owned.id;
        const key = `${owned.user_id}:${productKey}`;
        sharedPackagesByParentAndProduct.set(
          key,
          [...(sharedPackagesByParentAndProduct.get(key) || []), owned],
        );
      });
      const sharedShuttleTargets: OwnedPackageTarget[] = Array.from(sharedPackagesByParentAndProduct.values())
        .map((ownedGroup) => {
          const targetMonthPackage = ownedGroup
            .filter((owned) => overlaps(owned, selectedPeriod))
            .sort(newestFirst)[0];
          const renewalSourcePackage = ownedGroup
            .filter((owned) => overlaps(owned, previousPeriod)
              || (!owned.valid_from && !packageEnd(owned) && owned.status === 'active'))
            .sort(newestFirst)[0];
          const owned = targetMonthPackage || renewalSourcePackage;
          if (!owned) return null;

          const representativeStudent = (studentsByParentId.get(owned.user_id) || [])
            .find((student) => !owned.branch_id || student.branch_id === owned.branch_id);
          if (!representativeStudent) return null;
          const option: any = owned.option_id ? optionById.get(owned.option_id) : null;
          return {
            userPackageId: owned.id,
            packageId: owned.package_id || null,
            hasTargetMonthPackage: Boolean(targetMonthPackage),
            voucherType: 'shuttle',
            studentId: representativeStudent.id,
            studentName: representativeStudent.student_name || '원생',
            branchId: representativeStudent.branch_id,
            childId: null,
            isSmsEnabled: representativeStudent.is_sms_enabled !== false,
            optionId: owned.option_id,
            packageName: option?.packages?.name || owned.package_name || '차량 이용권',
            optionLabel: option?.label || (owned.option_id ? '요금제 정보 없음' : '공용 이용권'),
            price: Number(owned.price ?? option?.price ?? 0),
            billingCycle: '월 기간제',
            paymentDay: '매월 1일',
            classNames: [],
            isShared: true,
          } satisfies OwnedPackageTarget;
        })
        .filter((target): target is OwnedPackageTarget => target !== null);

      const webTargets: OwnedPackageTarget[] = webOnlyStudents.flatMap((student) =>
        (student.academy_student_classes || [])
          .filter((mapping: any) => mapping.status === 'active' && mapping.package_option_id)
          .map((mapping: any) => ({
            userPackageId: `web:${mapping.id}`,
            packageId: null,
            hasTargetMonthPackage: false,
            voucherType: 'lesson',
            studentId: student.id,
            studentName: student.student_name || '원생',
            branchId: student.branch_id,
            childId: null,
            isSmsEnabled: student.is_sms_enabled !== false,
            optionId: mapping.package_option_id,
            packageName: mapping.package_options?.packages?.name || '수강료',
            optionLabel: mapping.package_options?.label || '요금제 정보 없음',
            price: Number(mapping.package_options?.price || 0),
            billingCycle: mapping.billing_cycle || '월 기간제',
            paymentDay: mapping.payment_day || '매월 1일',
            classNames: mapping.class_schedules?.target_class
              ? [mapping.class_schedules.target_class]
              : [],
          } satisfies OwnedPackageTarget)),
      );

      const targets = [
        ...appTargets.filter((target) => !plannedStudentIds.has(target.studentId)),
        ...plannedTargets,
        ...sharedShuttleTargets.filter((target) => !plannedStudentIds.has(target.studentId)),
        ...webTargets,
      ];
      setBillingTargets(targets);

      const targetStudentIds = Array.from(new Set(targets.map((target) => target.studentId)));
      const { data: issuedBills, error: issuedBillError } = targetStudentIds.length > 0
        ? await supabase
            .from('academy_bills')
            .select('student_id, package_option_id, bill_month, status, payment_request_id')
            .in('student_id', targetStudentIds)
            .eq('bill_month', selectedMonth)
        : { data: [], error: null };
      if (issuedBillError) throw issuedBillError;

      const nextBillStatuses: Record<string, TargetBillStatus> = {};
      (issuedBills as any[] || []).forEach((bill) => {
        const key = `${bill.student_id}:${bill.package_option_id || 'none'}:${bill.bill_month}`;
        const current = nextBillStatuses[key];
        if (current && current.status !== 'paid') return;
        nextBillStatuses[key] = {
          status: bill.status,
          paymentRequestId: bill.payment_request_id || null,
        };
      });
      setTargetBillStatuses(nextBillStatuses);
    } catch (err) {
      console.error('Error loading billing targets:', err);
      setBillingTargets([]);
      setTargetBillStatuses({});
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

  useEffect(() => {
    void loadAutoBillingSetting();
  }, [activeBranchId]);

  // Generate Invoices for all active students in the selected month
  const handleGenerateBills = async (targetMonth: string) => {
    const selectedTargets = billingTargets.filter((target) =>
      selectedBillingStudentIds.has(target.studentId) && !target.hasTargetMonthPackage,
    );

    if (selectedBillingStudentIds.size === 0) {
      alert('고지서를 발행할 원생을 한 명 이상 선택해 주세요.');
      return;
    }

    const branchName = activeBranchId && activeBranchId !== 'all' 
      ? branches.find(b => b.id === activeBranchId)?.name || '해당'
      : '전체';

    const validityStart = `${targetMonth}-01`;
    const validityEnd = new Date(
      Date.UTC(Number(targetMonth.slice(0, 4)), Number(targetMonth.slice(5, 7)), 0),
    ).toISOString().slice(0, 10);
    if (!confirm(`${branchName} 지점에서 선택한 원생 ${selectedBillingStudentIds.size}명에게 [${targetMonth}월분] 청구 고지서를 발행하시겠습니까?\n이용권 사용기간: ${validityStart} ~ ${validityEnd}\n선택한 원생이 보유한 이용권별로 생성되며, 이미 발행된 고지서는 건너뜁니다.`)) {
      return;
    }

    setActionLoading(true);
    try {
      if (selectedTargets.length === 0) {
        alert('자녀에게 연결된 활성 수업 이용권이 없습니다. 실제 보유 이용권의 자녀 연결 상태를 확인해 주세요.');
        setActionLoading(false);
        return;
      }

      let createdCount = 0;
      let alreadyCount = 0;
      let failCount = 0;
      let lastErrMsg = '';

      for (const target of selectedTargets) {
        let existingQuery = supabase
          .from('academy_bills')
          .select('id, status')
          .eq('student_id', target.studentId)
          .eq('bill_month', targetMonth);

        if (target.optionId) {
          existingQuery = existingQuery.eq('package_option_id', target.optionId);
        } else {
          existingQuery = existingQuery.is('package_option_id', null);
        }

        const { data: existing, error: existingError } = await existingQuery.limit(1);
        if (existingError) throw existingError;

        if (existing?.some((bill) => bill.status !== 'paid')) {
          alreadyCount++;
          if (target.userPackageId.startsWith('plan:')) {
            await supabase.from('academy_student_monthly_plans').update({ status: 'applied' }).eq('id', target.userPackageId.slice(5));
          }
          continue;
        }

        // Create bill
        const billPayload: any = {
          branch_id: target.branchId,
          student_id: target.studentId,
          class_schedule_id: null,
          package_option_id: target.optionId,
          bill_month: targetMonth,
          amount_due: target.price,
          amount_paid: 0,
          billing_date: new Date().toISOString().slice(0, 10),
          status: 'unpaid',
          memo: target.isShared
            ? `보유 이용권: ${target.packageName} (${target.optionLabel}) | 적용 대상: 가족 공용`
            : `보유 이용권: ${target.packageName} (${target.optionLabel}) | 연결 수업: ${target.classNames.join(', ') || '없음'}`
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
          if (target.userPackageId.startsWith('plan:')) {
            const { error: planStatusError } = await supabase
              .from('academy_student_monthly_plans')
              .update({ status: 'applied' })
              .eq('id', target.userPackageId.slice(5));
            if (planStatusError) throw planStatusError;
          }
        }
      }

      if (failCount > 0 && createdCount === 0) {
        alert(`청구서 DB 저장 중 오류가 발생했습니다:\n${lastErrMsg}`);
      } else {
        alert(`청구서 처리 완료!\n- 새로 발행된 청구서: ${createdCount}건\n- 이미 발행되어 건너뜀: ${alreadyCount}건\n\n[청구내역 조회] 탭으로 자동 이동합니다.`);
      }

      setSelectedMonth(targetMonth);
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

  const handleDeleteBill = async (bill: Bill) => {
    if (bill.amount_paid > 0 || !['unpaid', 'declined', 'expired'].includes(bill.status)) {
      alert('결제 또는 수납이 시작된 청구서는 삭제할 수 없습니다.');
      return;
    }
    const label = bill.package_options
      ? `${bill.package_options.packages?.name || '이용권'} (${bill.package_options.label})`
      : bill.memo || '청구 항목';
    if (!confirm(`${bill.academy_students?.student_name || '원생'}의 ${bill.bill_month}월 ${label} 청구서를 삭제할까요?\n이미 앱으로 발송된 미결제 청구서는 만료 처리됩니다.`)) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('delete_unpaid_academy_bill', {
        p_bill_id: bill.id,
        p_reason: '수납 관리에서 청구서 삭제',
      });
      if (error) throw error;
      setSelectedAppBillIds((current) => {
        const next = new Set(current);
        next.delete(bill.id);
        return next;
      });
      await Promise.all([loadBills(), loadBillingTargets()]);
      alert('미결제 청구서를 삭제했습니다.');
    } catch (error: any) {
      alert(`청구서 삭제 실패: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      setActionLoading(false);
    }
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
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    const query = invoiceSearch.trim().toLowerCase();
    if (!query) return true;
    return (b.academy_students?.student_name || '').toLowerCase().includes(query)
      || (b.package_options?.packages?.name || '').toLowerCase().includes(query)
      || (b.package_options?.label || '').toLowerCase().includes(query)
      || (b.class_schedules?.target_class || '').toLowerCase().includes(query)
      || (b.memo || '').toLowerCase().includes(query);
  });

  const appSendableBills = filteredBills.filter((bill) =>
    bill.status === 'unpaid'
    && !bill.payment_request_id
    && Boolean(bill.academy_students?.parent_user_id)
    && Boolean(bill.package_option_id),
  );
  const allAppSendableBillsSelected = appSendableBills.length > 0
    && appSendableBills.every((bill) => selectedAppBillIds.has(bill.id));

  useEffect(() => {
    const availableIds = new Set(bills
      .filter((bill) => bill.status === 'unpaid' && !bill.payment_request_id)
      .map((bill) => bill.id));
    setSelectedAppBillIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => availableIds.has(id)));
      if (next.size === previous.size && Array.from(next).every((id) => previous.has(id))) return previous;
      return next;
    });
  }, [bills]);

  const toggleAppBill = (billId: string) => {
    setSelectedAppBillIds((previous) => {
      const next = new Set(previous);
      if (next.has(billId)) next.delete(billId);
      else next.add(billId);
      return next;
    });
  };

  const toggleAllAppBills = () => {
    setSelectedAppBillIds(
      allAppSendableBillsSelected
        ? new Set()
        : new Set(appSendableBills.map((bill) => bill.id)),
    );
  };

  const handleSendBillsToApp = async () => {
    if (selectedAppBillIds.size === 0) return alert('앱으로 발송할 미납 고지서를 선택해 주세요.');
    if (!confirm(`선택한 고지서 ${selectedAppBillIds.size}건을 학부모 앱으로 발송하시겠습니까?`)) return;

    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-academy-bills', {
        body: { academy_bill_ids: Array.from(selectedAppBillIds) },
      });
      if (error) throw error;

      const created = Number(data?.created ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      const failed = Number(data?.failed ?? 0);
      const failedMessages = Array.isArray(data?.results)
        ? data.results.filter((result: any) => !result.success).map((result: any) => result.error).filter(Boolean)
        : [];

      alert([
        `앱 청구서 발송 결과`,
        `- 발송: ${created}건`,
        `- 기존 발송 건너뜀: ${skipped}건`,
        `- 실패: ${failed}건`,
        failedMessages.length > 0 ? `\n${failedMessages.slice(0, 3).join('\n')}` : '',
      ].filter(Boolean).join('\n'));
      setSelectedAppBillIds(new Set());
      await loadBills();
    } catch (err: any) {
      alert(`앱 청구서 발송에 실패했습니다: ${err?.message || '알 수 없는 오류'}`);
    } finally {
      setActionLoading(false);
    }
  };

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
    return Array.from(groups.values()).sort((left, right) =>
      left.studentName.localeCompare(right.studentName, 'ko-KR')
    );
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
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900">매월 1일 자동 청구</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${autoBillingEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {autoBillingEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                체크한 원생에게만 발송하며, 갱신 완료 또는 이미 청구된 대상은 자동으로 제외합니다.
                <b className="ml-1 text-emerald-700">현재 대상 {autoBillingTargetStudentIds.size}명</b>
                {autoBillingLastRun ? ` 최근 실행: ${new Date(autoBillingLastRun).toLocaleString('ko-KR')}` : ''}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoBillingEnabled}
              onClick={() => void toggleAutoBilling()}
              disabled={!activeBranchId || activeBranchId === 'all' || autoBillingSaving}
              className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${autoBillingEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              title={activeBranchId === 'all' ? '자동 청구를 설정할 지점을 먼저 선택하세요.' : '자동 청구 설정'}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${autoBillingEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          <div className="flex justify-between items-center bg-blue-50 border border-blue-100/60 p-4 rounded-2xl">
            <div className="text-xs text-blue-800 font-medium">
              💡 <b>청구대상 관리:</b> 학원에 재학 중인 원생들의 수업반 요금 배정 장부입니다. <br />
              원생을 한 명 또는 여러 명 선택해 이번 달 또는 다음 달 고지서를 발행할 수 있습니다. 결제 완료 시 이용권은 청구 대상 월의 1일부터 말일까지 사용할 수 있습니다.
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedMonth(billingMonthByOffset(0))}
                className={`rounded-xl px-3 py-2 text-xs font-black transition ${selectedMonth === billingMonthByOffset(0) ? 'bg-blue-100 text-blue-700' : 'border border-slate-200 bg-white text-slate-600'}`}
              >
                이번 달
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth(billingMonthByOffset(1))}
                className={`rounded-xl px-3 py-2 text-xs font-black transition ${selectedMonth === billingMonthByOffset(1) ? 'bg-indigo-100 text-indigo-700' : 'border border-slate-200 bg-white text-slate-600'}`}
              >
                다음 달
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                aria-label="청구 대상 기준 월"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
              />
              <button
                type="button"
                onClick={() => handleGenerateBills(selectedMonth)}
                disabled={actionLoading || selectedBillingStudentIds.size === 0}
                className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2 text-xs font-black shadow-sm shrink-0"
              >
                {actionLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                {selectedMonth.slice(5)}월 학원비 청구
              </button>
            </div>
          </div>

          <div className="relative max-w-md">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={billingSearch}
              onChange={(event) => setBillingSearch(event.target.value)}
              placeholder="원생명, 수업반, 이용권 검색"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Always render table structure so column headers show even when empty */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs text-slate-600">
                <thead className="bg-slate-100/80 text-[11px] font-black uppercase text-slate-700 border-b border-slate-200">
                  <tr className="whitespace-nowrap">
                    <th scope="col" className="w-12 px-4 py-3.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>이번 청구</span>
                        <input
                          type="checkbox"
                          checked={allBillingStudentsSelected}
                          onChange={toggleAllBillingStudents}
                          disabled={selectableBillingStudents.length === 0}
                          aria-label="청구 대상 전체 선택"
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600"
                        />
                      </div>
                    </th>
                    <th scope="col" className="w-20 px-3 py-3.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>자동 청구</span>
                        <input
                          type="checkbox"
                          checked={allAutoBillingStudentsSelected}
                          onChange={toggleAllAutoBillingStudents}
                          disabled={billingTargetStudents.length === 0 || autoBillingTargetSaving || activeBranchId === 'all'}
                          aria-label="자동 청구 대상 전체 선택"
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </div>
                    </th>
                    <th scope="col" className="px-4 py-3.5 min-w-[140px]">연결 수업</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[150px]">이용권 요금제</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[150px] text-center">선택 월 청구 상태</th>
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
                      <td colSpan={12} className="text-center py-16">
                        <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                        <span className="text-xs font-bold text-slate-400 block mt-2">청구 대상 목록 조회 중...</span>
                      </td>
                    </tr>
                  ) : visibleBillingTargetStudents.length > 0 ? (
                    visibleBillingTargetStudents.map((student) => {
                      const alreadyBilled = isStudentAlreadyBilled(student);
                      const studentStates = student.packages.map((target) => {
                        if (target.hasTargetMonthPackage) return 'renewed';
                        const bill = targetBillStatuses[billStatusKey(target)];
                        if (!bill) return 'pending';
                        if (bill.status === 'paid') return 'paid';
                        if (bill.status === 'partial') return 'partial';
                        return bill.paymentRequestId ? 'sent' : 'issued';
                      });
                      const studentState = studentStates.every((state) => state === 'renewed')
                        ? 'renewed'
                        : studentStates.every((state) => state === 'paid')
                          ? 'paid'
                          : studentStates.some((state) => state === 'pending')
                            ? 'pending'
                            : studentStates.some((state) => state === 'partial')
                              ? 'partial'
                              : studentStates.some((state) => state === 'sent')
                                ? 'sent'
                                : 'issued';
                      const studentStateMeta = {
                        renewed: { label: '갱신 완료', row: 'bg-violet-50/80', badge: 'border-violet-200 bg-violet-100 text-violet-700' },
                        paid: { label: '완납', row: 'bg-emerald-50/80', badge: 'border-emerald-200 bg-emerald-100 text-emerald-700' },
                        partial: { label: '일부 수납', row: 'bg-amber-50/80', badge: 'border-amber-200 bg-amber-100 text-amber-700' },
                        sent: { label: '앱 발송됨', row: 'bg-sky-50/80', badge: 'border-sky-200 bg-sky-100 text-sky-700' },
                        issued: { label: '청구서 생성됨', row: 'bg-blue-50/80', badge: 'border-blue-200 bg-blue-100 text-blue-700' },
                        pending: { label: '청구 예정', row: 'bg-slate-50/80', badge: 'border-slate-200 bg-white text-slate-600' },
                      }[studentState];
                      return (
                      <React.Fragment key={student.studentId}>
                        <tr className={`border-t border-slate-200 ${studentStateMeta.row}`}>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={selectedBillingStudentIds.has(student.studentId)}
                              onChange={() => toggleBillingStudent(student.studentId)}
                              disabled={alreadyBilled}
                              aria-label={`${student.studentName} 청구 대상 선택`}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={autoBillingTargetStudentIds.has(student.studentId)}
                              onChange={() => toggleAutoBillingStudent(student.studentId)}
                              disabled={autoBillingTargetSaving || activeBranchId === 'all'}
                              aria-label={`${student.studentName} 자동 청구 대상 선택`}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </td>
                          <td colSpan={10} className="px-4 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                 <span className="font-black text-slate-900 text-sm">{student.studentName}</span>
                                 <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-black ${studentStateMeta.badge}`}>
                                   {studentStateMeta.label}
                                 </span>
                                 <span className="ml-2 text-[11px] font-bold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-full">
                                  이용권 {student.packages.length}개
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800">
                                  예상 교습비 <b className="text-blue-600">{student.packages.reduce((sum, item) => sum + (item.hasTargetMonthPackage ? 0 : item.price), 0).toLocaleString()}</b>원
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {student.packages.map((ownedPackage) => {
                          const packageName = ownedPackage.packageName;
                          const packageLabel = ownedPackage.optionLabel;
                          const normalizedVoucherType = (ownedPackage.voucherType || '').toLowerCase();
                          const normalizedPackageName = packageName.toLowerCase();
                          const voucherTypeLabel = normalizedVoucherType.includes('shuttle') || normalizedVoucherType.includes('bus') || normalizedVoucherType.includes('vehicle') || /버스|차량|셔틀/.test(normalizedPackageName)
                            ? '버스 이용권'
                            : normalizedVoucherType.includes('single') || normalizedVoucherType.includes('one') || /단품|1회/.test(normalizedPackageName)
                              ? '단품 이용권'
                              : '수업 이용권';
                          const price = ownedPackage.price > 0 ? `${ownedPackage.price.toLocaleString()}원` : '단가 미지정';
                          const dayNum = (ownedPackage.paymentDay || '1일').replace(/[^0-9]/g, '') || '01';
                          const formattedDay = dayNum.padStart(2, '0');
                          const statusForMonth = (month: string) => targetBillStatuses[
                            `${ownedPackage.studentId}:${ownedPackage.optionId || 'none'}:${month}`
                          ];
                          const selectedBillStatus = statusForMonth(selectedMonth);
                          const rowState = ownedPackage.hasTargetMonthPackage
                            ? 'renewed'
                            : selectedBillStatus?.status === 'paid'
                              ? 'paid'
                              : selectedBillStatus?.status === 'partial'
                                ? 'partial'
                                : selectedBillStatus?.status === 'cancelled' || selectedBillStatus?.status === 'canceled'
                                  ? 'cancelled'
                                  : selectedBillStatus?.paymentRequestId
                                    ? 'sent'
                                    : selectedBillStatus
                                      ? 'issued'
                                      : 'pending';
                          const rowStyle = {
                            renewed: 'border-l-4 border-l-violet-500 bg-violet-50/40 hover:bg-violet-50/80',
                            paid: 'border-l-4 border-l-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/80',
                            partial: 'border-l-4 border-l-amber-500 bg-amber-50/40 hover:bg-amber-50/80',
                            cancelled: 'border-l-4 border-l-rose-400 bg-rose-50/30 hover:bg-rose-50/70',
                            sent: 'border-l-4 border-l-sky-500 bg-sky-50/40 hover:bg-sky-50/80',
                            issued: 'border-l-4 border-l-blue-500 bg-blue-50/30 hover:bg-blue-50/70',
                            pending: 'border-l-4 border-l-slate-200 bg-white hover:bg-slate-50',
                          }[rowState];
                          const renderBillStatus = (monthLabel: string, month: string) => {
                            if (ownedPackage.hasTargetMonthPackage && month === selectedMonth) {
                              return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">{monthLabel} 이용권 보유</span>;
                            }
                            const billStatus = statusForMonth(month);
                            if (!billStatus) {
                              return <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-400">{monthLabel} 미청구</span>;
                            }
                            const paid = billStatus.status === 'paid';
                            const partial = billStatus.status === 'partial';
                            const cancelled = billStatus.status === 'cancelled' || billStatus.status === 'canceled';
                            const label = paid
                              ? `${monthLabel} 완납`
                              : partial
                                ? `${monthLabel} 일부수납`
                                : cancelled
                                  ? `${monthLabel} 취소`
                                  : `${monthLabel} 청구됨${billStatus.paymentRequestId ? ' · 앱발송' : ''}`;
                            return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${paid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : partial ? 'border-amber-200 bg-amber-50 text-amber-700' : cancelled ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{label}</span>;
                          };
                          return (
                            <tr key={ownedPackage.userPackageId} className={`font-bold text-slate-700 transition whitespace-nowrap ${rowStyle}`}>
                              <td className="px-4 py-3" aria-hidden="true" />
                              <td className="px-3 py-3" aria-hidden="true" />
                              <td className="px-4 py-3"><div className="flex max-w-xs flex-wrap gap-1">{ownedPackage.isShared ? <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">가족 공용</span> : ownedPackage.classNames.length > 0 ? ownedPackage.classNames.map((className) => <span key={className} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 font-bold">{className}</span>) : <span className="text-[10px] text-slate-400">연결 수업 없음</span>}</div></td>
                              <td className="px-4 py-3"><div className="flex items-center gap-1.5"><span className="text-xs font-black text-slate-900">{packageName}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-500">{voucherTypeLabel}</span></div><div className="text-[10px] text-slate-400 font-medium">{packageLabel}</div></td>
                              <td className="px-4 py-3 text-center">
                                {renderBillStatus(`${Number(selectedMonth.slice(5))}월`, selectedMonth)}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500 text-center font-medium">{ownedPackage.billingCycle}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 text-center font-medium">{ownedPackage.paymentDay}</td>
                              <td className="px-4 py-3 text-xs font-medium text-slate-400 text-center">없음</td>
                              <td className="px-4 py-3 font-black text-blue-600 text-right">₩ {price}</td>
                              <td className="px-4 py-3 text-xs font-medium text-slate-700 text-center">{ownedPackage.hasTargetMonthPackage ? <span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 font-black text-emerald-700">갱신 완료</span> : <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded font-bold">{selectedMonth}-{formattedDay} 청구예정 <ArrowRight size={10} className="text-slate-400" /></span>}</td>
                              <td className="px-4 py-3 text-center">{ownedPackage.hasTargetMonthPackage ? <span className="text-slate-300">-</span> : <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${student.isSmsEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>{student.isSmsEnabled ? '발송' : '미발송'}</span>}</td>
                              <td className="px-4 py-3 text-center">{ownedPackage.isShared ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700">공용 차량</span> : <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] text-indigo-700 font-black">{ownedPackage.classNames.length}개 수업</span>}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={12} className="text-center py-20 text-slate-400 font-bold text-xs bg-slate-50/30">
                        {billingSearch ? '검색 조건에 맞는 청구 대상이 없습니다.' : '배정된 청구 대상이 없습니다. [학생 관리] 탭에서 학생을 등록하고 반과 요금제를 매핑해 주세요!'}
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

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

            <div className="relative min-w-[240px] flex-1 max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={invoiceSearch}
                onChange={(event) => setInvoiceSearch(event.target.value)}
                placeholder="원생명, 수업반, 이용권 검색"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMonth(billingMonthByOffset(0))}
                className={`rounded-xl px-3 py-2 text-xs font-black transition ${selectedMonth === billingMonthByOffset(0) ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                이번 달 조회
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth(billingMonthByOffset(1))}
                className={`rounded-xl px-3 py-2 text-xs font-black transition ${selectedMonth === billingMonthByOffset(1) ? 'bg-indigo-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                다음 달 조회
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                aria-label="청구 내역 기준 월"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
              />
              <span className="text-xs text-slate-400 font-bold">
                기준 월: {selectedMonth.slice(0, 4)}년 {selectedMonth.slice(5)}월
              </span>
              <button
                type="button"
                onClick={handleSendBillsToApp}
                disabled={actionLoading || selectedAppBillIds.size === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={13} />}
                선택 {selectedAppBillIds.size}건 앱으로 발송
              </button>
            </div>
          </div>

          {/* Always render table structure so column headers show even when empty */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs text-slate-600">
                <thead className="bg-slate-100/80 text-[11px] font-black uppercase text-slate-700 border-b border-slate-200">
                  <tr className="whitespace-nowrap">
                    <th scope="col" className="px-4 py-3.5 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={allAppSendableBillsSelected}
                        onChange={toggleAllAppBills}
                        aria-label="앱 발송 가능한 고지서 전체 선택"
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                      />
                    </th>
                    <th scope="col" className="px-4 py-3.5 min-w-[220px]">연결 수업 / 보유 이용권</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[180px] text-center">청구월 / 이용기간</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[110px] text-right">청구액</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[110px] text-right">실 수납액</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[110px] text-center">수납 수단</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[110px] text-center">최종 처리일</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[90px] text-center">상태</th>
                    <th scope="col" className="px-4 py-3.5 min-w-[100px] text-center">앱 청구서</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16">
                        <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                        <span className="text-xs font-bold text-slate-400 block mt-2">고지 정보 및 수납 목록 조회 중...</span>
                      </td>
                    </tr>
                  ) : filteredBillStudents.length > 0 ? (
                    filteredBillStudents.map((student) => (
                      <React.Fragment key={student.studentId}>
                        <tr className="border-t border-slate-200 bg-blue-50/60">
                          <td colSpan={9} className="px-4 py-2.5">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-black text-slate-900 text-sm">{student.studentName}</span>
                                <span className="ml-2 text-[11px] font-bold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-full">
                                  청구 이용권 {student.bills.length}개
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800">
                                  총 청구액 <b className="text-blue-600">{student.bills.reduce((sum, bill) => sum + bill.amount_due, 0).toLocaleString()}</b>원
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {student.bills.map((bill) => {
                          const validity = billingMonthPeriod(bill.bill_month);
                          const connectedClassText = bill.memo?.match(/연결 수업:\s*(.+)$/)?.[1]?.trim();
                          const className = bill.class_schedules?.target_class
                            || (connectedClassText && connectedClassText !== '없음' ? connectedClassText : '수업 미지정');
                          const packageLabel = bill.package_options ? `[${bill.package_options.packages?.name || ''}] ${bill.package_options.label}` : bill.memo || '수강 정보 연동 안 됨';
                          const isPaid = bill.status === 'paid';
                          const canSendToApp = bill.status === 'unpaid' && !bill.payment_request_id && Boolean(bill.academy_students?.parent_user_id) && Boolean(bill.package_option_id);
                          const isDeclined = bill.status === 'declined';
                          const isExpired = bill.status === 'expired';
                          const canDeleteBill = bill.amount_paid === 0 && ['unpaid', 'declined', 'expired'].includes(bill.status);
                          const methodText: Record<string, string> = { app_card: '어플 카드결제', app_vbank: '어플 가상계좌', offline_card: '현장 카드', cash: '현금 수납', bank_transfer: '계좌 이체', offline_transfer: '현장 계좌이체' };
                          return (
                            <tr key={bill.id} className="font-bold text-slate-700 hover:bg-slate-50 transition whitespace-nowrap">
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedAppBillIds.has(bill.id)}
                                  onChange={() => toggleAppBill(bill.id)}
                                  disabled={!canSendToApp}
                                  aria-label={`${student.studentName} 고지서 앱 발송 선택`}
                                  className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-30"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="text-xs font-black text-slate-800">{className}</span>
                                  <span className="text-[10px] font-medium text-slate-500">보유 이용권: {packageLabel}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="text-xs font-black text-slate-800">{bill.bill_month}월분</div>
                                <div className="mt-0.5 text-[10px] font-medium text-slate-400">{validity.start} ~ {validity.end}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-800 font-bold text-right">{bill.amount_due.toLocaleString()}원</td>
                              <td className="px-4 py-3 text-slate-800 font-bold text-right">{isPaid ? `${bill.amount_paid.toLocaleString()}원` : '-'}</td>
                              <td className="px-4 py-3 text-xs text-center">{bill.payment_method ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 font-bold text-[11px]">{methodText[bill.payment_method] || bill.payment_method}</span> : '-'}</td>
                              <td className="px-4 py-3 text-xs font-medium text-slate-500 text-center">{bill.payment_date ? new Date(bill.payment_date).toLocaleDateString('ko-KR') : '-'}</td>
                              <td className="px-4 py-3 text-center">
                                {isPaid
                                  ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-700"><CheckCircle2 size={11} /> 완납</span>
                                  : isDeclined
                                    ? <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-0.5 text-[10px] font-black text-rose-700"><AlertCircle size={11} /> 학부모 거절</span>
                                    : isExpired
                                      ? <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-600"><AlertCircle size={11} /> 기한 만료</span>
                                      : <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[10px] font-black text-amber-700"><AlertCircle size={11} /> 미납</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex flex-col items-center gap-1.5">
                                  {isDeclined
                                    ? <span className="inline-flex rounded-full border border-rose-100 bg-rose-50 px-2.5 py-0.5 text-[10px] font-black text-rose-700">거절됨</span>
                                    : isExpired
                                      ? <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-600">만료됨</span>
                                      : bill.payment_request_id
                                    ? <span className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black text-indigo-700">발송 완료</span>
                                    : canSendToApp
                                      ? <span className="text-[10px] font-bold text-slate-400">발송 가능</span>
                                      : <span className="text-[10px] font-bold text-slate-300">발송 불가</span>}
                                  {canDeleteBill && <button type="button" onClick={() => void handleDeleteBill(bill)} disabled={actionLoading} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-black text-rose-600 hover:bg-rose-50 disabled:text-slate-300"><Trash2 size={10}/> 삭제</button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center py-20 text-slate-400 font-bold text-xs bg-slate-50/30">
                        {selectedMonth}월분으로 생성된 수납 고지서가 없습니다. [청구대상 관리]에서 해당 월 학원비를 청구해 주세요.
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
