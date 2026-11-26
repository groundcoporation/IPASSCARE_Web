import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { Plus, Pencil, Trash2, Search, Upload, Loader2, Link2, Link2Off, Download, CheckCircle, Clock, AlertTriangle, RefreshCw, X, CreditCard, LogOut } from 'lucide-react';
import { loadActiveAppSchedulesByChild } from '../../../../lib/adminScheduleAssignments';
import { handleError } from '../../../../errors/handleError';
import { downloadExcel } from '../../../../lib/excelDownload';
import { AppError } from '../../../../errors/appError';
import { loadStudentData } from '../api/studentData';
import { loadWithdrawalData } from '../api/withdrawalData';
import { emptyStudentDetail, loadStudentDetailData } from '../api/studentDetailData';
import { saveStudentData, requiresStudentSaveReview } from '../api/studentSave';
import { importStudents } from '../api/studentImport';
import { addStudentAdditionalBilling, correctStudentBillingPlan } from '../api/studentBilling';
import { archiveStudentRecord, saveRefundRecord } from '../api/studentLifecycle';
import type { Student, UnregisteredMember, ClassSchedule, PackageOption, WithdrawalRecord, PickupSpotOption, ClassAssignment } from '../types';

export type { WithdrawalRecord } from '../types';
const emptyAssignment = (): ClassAssignment => ({
  class_schedule_id: '',
  package_option_id: '',
  billing_cycle: '월 기간제',
  payment_day: '매월 1일',
});

const nextMonthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
    .toISOString().slice(0, 10);
};

const billMonthByOffset = (offset: number) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const currentBillMonth = () => billMonthByOffset(0);

const monthLabel = (offset: number) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
};

const scheduleLabel = (schedule: {
  target_class: string;
  day_of_week?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}) => {
  const time = schedule.start_time?.slice(0, 5) || '';
  const endTime = schedule.end_time?.slice(0, 5) || '';
  const timeRange = time ? `${time}${endTime ? `~${endTime}` : ''}` : '';
  const detail = [schedule.day_of_week ? `${schedule.day_of_week}요일` : '', timeRange]
    .filter(Boolean).join(' ');
  return detail ? `${schedule.target_class} · ${detail}` : schedule.target_class;
};

const voucherTypeLabel = (voucherType?: string | null) => {
  if (voucherType === 'shuttle') return '차량';
  if (voucherType === 'gps') return 'GPS';
  if (voucherType === 'single' || voucherType === 'one_time') return '단품';
  if (voucherType === 'lesson') return '수업';
  return '기타';
};

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const normalizedWeekday = (value?: string | null) => (value || '').replace('요일', '').trim();

interface AdminStudentTabProps {
  activeBranchId: string | null;
  branches: Array<{ id: string; name: string }>;
}

export const AdminStudentTab: React.FC<AdminStudentTabProps> = ({ activeBranchId, branches }) => {
  const loadSequence = useRef(0);
  const templateInFlight = useRef(false);
  const detailLoadSequence = useRef(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [unregisteredMembers, setUnregisteredMembers] = useState<UnregisteredMember[]>([]);
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [packageOptions, setPackageOptions] = useState<PackageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assignedClassOnly, setAssignedClassOnly] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);

  // 삭제 이중확인 모달 State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetStudentForDelete, setTargetStudentForDelete] = useState<{ id: string; name: string; child_id?: string | null } | null>(null);
  const [confirmInputName, setConfirmInputName] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [parentName, setParentName] = useState('');
  const [attendanceCode, setAttendanceCode] = useState('');
  const [motherPhone, setMotherPhone] = useState('');
  const [fatherPhone, setFatherPhone] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [address, setAddress] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [memo, setMemo] = useState('');
  const [isSmsEnabled, setIsSmsEnabled] = useState(true);
  const [pickupSpots, setPickupSpots] = useState<PickupSpotOption[]>([]);
  const [pickupSpotId, setPickupSpotId] = useState('');
  const [dropoffSpotId, setDropoffSpotId] = useState('');
  const [pickupDetailLocation, setPickupDetailLocation] = useState('');
  const [dropoffDetailLocation, setDropoffDetailLocation] = useState('');
  const [pickupSettingsLoading, setPickupSettingsLoading] = useState(false);
  const [classAssignments, setClassAssignments] = useState<ClassAssignment[]>([emptyAssignment()]);
  const [saveLoading, setSaveLoading] = useState(false);
  const saveInFlight = useRef(false);
  const billingMutationInFlight = useRef(false);
  const refundInFlight = useRef(false);
  const lifecycleSequence = useRef(0);
  const archiveInFlight = useRef(false);
  const [courseTab, setCourseTab] = useState<'current' | 'next'>('current');
  const [nextMonthClassIds, setNextMonthClassIds] = useState<string[]>([]);
  const [nextMonthClassDay, setNextMonthClassDay] = useState('전체');
  const [nextMonthPackages, setNextMonthPackages] = useState<ClassAssignment[]>([]);
  const [nextMonthPackageSource, setNextMonthPackageSource] = useState<'saved_month' | 'saved_recurring' | 'preview' | 'none' | 'edited'>('none');
  const [currentMonthPackages, setCurrentMonthPackages] = useState<ClassAssignment[]>([]);
  const [currentMonthPackageSource, setCurrentMonthPackageSource] = useState<'current_plan' | 'current_bill' | 'previous_plan' | 'previous_bill' | 'active_owned' | 'none'>('none');
  const [currentMonthBillingLocked, setCurrentMonthBillingLocked] = useState(false);
  const [additionalPackageOptionId, setAdditionalPackageOptionId] = useState('');
  const [additionalBillSaving, setAdditionalBillSaving] = useState(false);
  const [currentMonthClassIds, setCurrentMonthClassIds] = useState<string[]>([]);
  const [currentMonthClassDay, setCurrentMonthClassDay] = useState('전체');
  const [applyCurrentClassesToNextMonth, setApplyCurrentClassesToNextMonth] = useState(true);
  const [currentPackageLabels, setCurrentPackageLabels] = useState<string[]>([]);
  const [currentBillingPlanMismatches, setCurrentBillingPlanMismatches] = useState<Array<{
    planId: string;
    plannedOptionId: string;
    plannedLabel: string;
    userPackageId: string;
    actualOptionId: string;
    actualLabel: string;
  }>>([]);
  const [billingPlanCorrectionSaving, setBillingPlanCorrectionSaving] = useState(false);

  // 🚀 Top View Tab: 'active' (재원생 명부) | 'withdrawn' (퇴원·탈퇴 회원)
  const [viewTab, setViewTab] = useState<'active' | 'unregistered' | 'withdrawn'>('active');
  const withdrawalLoadSequence = useRef(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRecord | null>(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundStatus, setRefundStatus] = useState<'pending' | 'completed' | 'none'>('pending');
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundMemo, setRefundMemo] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);

  // Publish the complete roster only for the latest request.
  const loadData = useCallback(async (reportError = true, isCurrent: () => boolean = () => true) => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const data = await loadStudentData(activeBranchId, currentBillMonth(), {
        client: supabase,
        loadSchedules: loadActiveAppSchedulesByChild,
      });
      if (sequence !== loadSequence.current || !isCurrent()) return;
      setClasses(data.classes);
      setPackageOptions(data.packageOptions);
      setUnregisteredMembers(data.unregisteredMembers);
      setStudents(data.students);
      return data;
    } catch (error: unknown) {
      if (sequence !== loadSequence.current || !isCurrent()) return;
      setClasses([]);
      setPackageOptions([]);
      setUnregisteredMembers([]);
      setStudents([]);
      if (!reportError) throw error;
      await handleError(error, 'STUDENT_LOAD_FAILED', { operation: 'student.roster.load' });
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [activeBranchId]);

  // Inferred legacy rows are display-only; this path never creates withdrawal records.
  const loadWithdrawals = useCallback(async (reportError: boolean = true, isCurrent: () => boolean = () => true) => {
    const sequence = ++withdrawalLoadSequence.current;
    setWithdrawalLoading(true);
    try {
      const records = await loadWithdrawalData(activeBranchId, { client: supabase });
      if (sequence !== withdrawalLoadSequence.current || !isCurrent()) return;
      setWithdrawals(records);
      return records;
    } catch (error: unknown) {
      if (sequence !== withdrawalLoadSequence.current || !isCurrent()) return;
      setWithdrawals([]);
      if (!reportError) throw error;
      await handleError(error, 'WITHDRAWAL_LOAD_FAILED', { operation: 'student.withdrawal.load' });
    } finally {
      if (sequence === withdrawalLoadSequence.current) setWithdrawalLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    loadData();
    return () => { loadSequence.current += 1; };
  }, [loadData]);

  useEffect(() => {
    void loadWithdrawals();
    return () => { withdrawalLoadSequence.current += 1; };
  }, [loadWithdrawals]);

  // Open refund process modal
  const openRefundModal = (item: WithdrawalRecord) => {
    if (refundInFlight.current) return;
    setSelectedWithdrawal(item);
    setRefundStatus(item.refund_status || 'pending');
    setRefundAmount(item.refund_amount || 0);
    setRefundMemo(item.refund_memo || '');
    setRefundModalOpen(true);
  };

  useEffect(() => {
    setRefundModalOpen(false);
    setDeleteModalOpen(false);
    return () => { lifecycleSequence.current += 1; };
  }, [activeBranchId]);

  const refreshStudentLifecycle = async (sequence: number) => {
    const isCurrent = () => sequence === lifecycleSequence.current;
    const results = await Promise.all([loadData(false, isCurrent), loadWithdrawals(false, isCurrent)]);
    return isCurrent() && results.every(result => result !== undefined);
  };

  // Bookkeeping only; this does not execute a payment refund.
  const handleSaveRefund = async () => {
    if (!selectedWithdrawal || refundInFlight.current || archiveInFlight.current
      || saveInFlight.current || billingMutationInFlight.current) return;
    refundInFlight.current = true;
    const sequence = lifecycleSequence.current;
    let saved = false;
    setRefundSaving(true);
    try {
      await saveRefundRecord({ record: selectedWithdrawal, status: refundStatus, amount: refundAmount, memo: refundMemo }, { client: supabase });
      saved = true;
      if (sequence !== lifecycleSequence.current) return;
      setRefundModalOpen(false);
      if (await refreshStudentLifecycle(sequence)) alert('환불 정산 정보가 안전하게 저장되었습니다.');
    } catch (error: unknown) {
      if (sequence === lifecycleSequence.current && error instanceof AppError && error.code === 'REFUND_RECORD_SAVE_UNCONFIRMED') {
        setRefundModalOpen(false);
      }
      await handleError(saved ? new AppError('STUDENT_ACTION_REFRESH_FAILED', error) : error,
        'REFUND_RECORD_SAVE_UNCONFIRMED', { operation: 'student.refund-record.save' });
    } finally {
      refundInFlight.current = false;
      setRefundSaving(false);
    }
  };

  const handleDepartStudent = async (student: Student) => {
    if (archiveInFlight.current || saveInFlight.current || billingMutationInFlight.current || refundInFlight.current || saveLoading || deleteLoading) return;
    const reason = prompt('퇴원 사유를 입력해 주세요.', '수강 종료');
    if (reason === null || !confirm('퇴원 처리하시겠습니까? 재원 목록에서 제외되며 기존 청구와 일지는 보존됩니다.')) return;
    archiveInFlight.current = true;
    const sequence = lifecycleSequence.current;
    const editorSequence = detailLoadSequence.current;
    let saved = false;
    setSaveLoading(true);
    try {
      await archiveStudentRecord(student.id, reason, { client: supabase });
      saved = true;
      if (sequence !== lifecycleSequence.current) return;
      if (editorSequence === detailLoadSequence.current) closeStudentModal();
      if (await refreshStudentLifecycle(sequence)) alert('퇴원 처리했습니다. 기존 청구와 일지는 보존됩니다.');
    } catch (error: unknown) {
      if (sequence === lifecycleSequence.current && editorSequence === detailLoadSequence.current
        && error instanceof AppError && error.code === 'STUDENT_ARCHIVE_UNCONFIRMED') closeStudentModal();
      await handleError(saved ? new AppError('STUDENT_ACTION_REFRESH_FAILED', error) : error,
        'STUDENT_ARCHIVE_UNCONFIRMED', { operation: 'student.archive' });
    } finally {
      archiveInFlight.current = false;
      setSaveLoading(false);
    }
  };

  // Open modal for registration/edit
  const closeStudentModal = useCallback(() => {
    detailLoadSequence.current += 1;
    setPickupSettingsLoading(false);
    setIsModalOpen(false);
  }, []);

  useEffect(() => {
    closeStudentModal();
    return () => { detailLoadSequence.current += 1; };
  }, [activeBranchId, closeStudentModal]);

  const openModal = async (student?: Student, options: { reportError?: boolean; packageOptions?: PackageOption[] } = {}) => {
    if (saveInFlight.current) return;
    const sequence = ++detailLoadSequence.current;
    setIsModalOpen(false);
    setPickupSettingsLoading(Boolean(student?.child_id));
    try {
      const detail = student ? await loadStudentDetailData(student, options.packageOptions || packageOptions, {
        currentMonth: currentBillMonth(), previousMonth: billMonthByOffset(-1), nextMonthStart: nextMonthStart(),
        today: new Date().toISOString().slice(0, 10),
      }, { client: supabase }) : emptyStudentDetail();
      if (sequence !== detailLoadSequence.current) return;
      setPickupSpots([]);
      setPickupSpotId('');
      setDropoffSpotId('');
      setPickupDetailLocation('');
      setDropoffDetailLocation('');
      setCurrentBillingPlanMismatches([]);
      if (student) {
        setEditingId(student.id);
        setSelectedBranchId(student.branch_id);
        setStudentName(student.student_name);
        setParentName(student.parent_user?.name || student.parent_name || '');
        setAttendanceCode(student.attendance_code);
        setMotherPhone(student.mother_phone || '');
        setFatherPhone(student.father_phone || '');
        setStudentPhone(student.student_phone || '');
        setBirthDate(student.birth_date || '');
        setSchoolName(student.school_name || '');
        setGradeLevel(student.grade_level || '');
        setAddress(student.address || '');
        setAdmissionDate(student.admission_date || '');
        setMemo(student.memo || '');
        setIsSmsEnabled(student.is_sms_enabled);
        setCourseTab('current');
        setCurrentMonthClassDay('전체');
        setNextMonthClassDay('전체');
        setApplyCurrentClassesToNextMonth(true);

        // Get first assigned class details if exists
        const assignments = (student.academy_student_classes || [])
          .filter((assignment) => (assignment.status || 'active') === 'active');
        setClassAssignments(assignments.length > 0
          ? assignments.map((assignment) => ({
              class_schedule_id: assignment.class_schedule_id || '',
              package_option_id: assignment.package_option_id || '',
              billing_cycle: assignment.billing_cycle || '월 기간제',
              payment_day: assignment.payment_day || '매월 1일',
            }))
          : [emptyAssignment()]);

        if (student.child_id) {
          setPickupSpots(detail.pickupSpots);
          setPickupSpotId(detail.pickupSpotId);
          setDropoffSpotId(detail.dropoffSpotId);
          setPickupDetailLocation(detail.pickupDetailLocation);
          setDropoffDetailLocation(detail.dropoffDetailLocation);
          setCurrentPackageLabels(detail.currentPackageLabels);
          setCurrentBillingPlanMismatches(detail.currentBillingPlanMismatches);
          setCurrentMonthBillingLocked(detail.currentMonthBillingLocked);
          setAdditionalPackageOptionId(detail.additionalPackageOptionId);
          setCurrentMonthPackageSource(detail.currentMonthPackageSource);
          setCurrentMonthPackages(detail.currentMonthPackages);
          setCurrentMonthClassIds(detail.currentMonthClassIds);
          setNextMonthClassIds(detail.nextMonthClassIds);
          setNextMonthPackageSource(detail.nextMonthPackageSource);
          setNextMonthPackages(detail.nextMonthPackages);
        } else {
          setCurrentPackageLabels([]);
          setCurrentMonthPackages([]);
          setCurrentMonthPackageSource('none');
          setCurrentMonthBillingLocked(false);
          setAdditionalPackageOptionId('');
          setCurrentMonthClassIds([]);
          setNextMonthClassIds([]);
          setNextMonthPackages([]);
          setNextMonthPackageSource('none');
        }
      } else {
        setEditingId(null);
        setSelectedBranchId(activeBranchId && activeBranchId !== 'all' ? activeBranchId : (branches.length > 0 ? branches[0].id : ''));
        setStudentName('');
        setParentName('');
        setAttendanceCode('');
        setMotherPhone('');
        setFatherPhone('');
        setStudentPhone('');
        setBirthDate('');
        setSchoolName('');
        setGradeLevel('');
        setAddress('');
        setAdmissionDate(new Date().toISOString().slice(0, 10));
        setMemo('');
        setIsSmsEnabled(true);
        setCourseTab('current');
        setCurrentMonthClassDay('전체');
        setNextMonthClassDay('전체');
        setApplyCurrentClassesToNextMonth(true);
        setCurrentPackageLabels([]);
        setCurrentMonthPackages([]);
        setCurrentMonthPackageSource('none');
        setCurrentMonthBillingLocked(false);
        setAdditionalPackageOptionId('');
        setCurrentMonthClassIds([]);
        setNextMonthClassIds([]);
        setNextMonthPackages([]);
        setNextMonthPackageSource('none');
        setClassAssignments([emptyAssignment()]);
      }
      setIsModalOpen(true);
      return true;
    } catch (error: unknown) {
      if (sequence !== detailLoadSequence.current) return;
      setIsModalOpen(false);
      if (options.reportError === false) throw error;
      await handleError(error, 'STUDENT_LOAD_FAILED', { operation: 'student.detail.load' });
    } finally {
      if (sequence === detailLoadSequence.current) setPickupSettingsLoading(false);
    }
  };

  const refreshStudentBillingEditor = async (studentId: string, editorSequence: number) => {
    const isCurrent = () => editorSequence === detailLoadSequence.current;
    const data = await loadData(false, isCurrent);
    if (!data || !isCurrent()) return false;
    const student = data.students.find(item => item.id === studentId);
    if (!student) throw new AppError('BILL_STUDENT_INVALID');
    return await openModal(student, { reportError: false, packageOptions: data.packageOptions });
  };

  const handleAddCurrentMonthAdditionalBill = async () => {
    if (billingMutationInFlight.current || saveInFlight.current || archiveInFlight.current || refundInFlight.current) return;
    if (!editingId || !additionalPackageOptionId) {
      alert('추가 청구할 이용권을 선택해 주세요.');
      return;
    }
    const option = packageOptions.find((item) => item.id === additionalPackageOptionId);
    if (!option) return;
    if (currentMonthPackages.some((item) => item.package_option_id === additionalPackageOptionId)) {
      await handleError(
        { code: 'BILL_DUPLICATE_OPTION' },
        'BILL_DUPLICATE_OPTION',
        { operation: 'billing.additional-plan.duplicate' },
      );
      return;
    }
    if (!confirm(`${studentName} 원생에게 ${option.packages?.name || '이용권'} · ${option.label} ${option.price.toLocaleString()}원을 추가 청구로 등록할까요? 기존 청구·갱신 완료 항목은 변경되지 않습니다.`)) return;

    billingMutationInFlight.current = true;
    const editorSequence = detailLoadSequence.current;
    let saved = false;
    setAdditionalBillSaving(true);
    try {
      await addStudentAdditionalBilling(editingId, additionalPackageOptionId, { client: supabase });
      saved = true;
      if (editorSequence !== detailLoadSequence.current) return;
      if (await refreshStudentBillingEditor(editingId, editorSequence)) {
        alert('추가 청구 항목을 등록했습니다. 수납 관리에서 별도 청구 대상으로 표시됩니다.');
      }
    } catch (error: unknown) {
      if ((saved || error instanceof AppError && error.code === 'BILL_PLAN_CHANGE_UNCONFIRMED')
        && editorSequence === detailLoadSequence.current) closeStudentModal();
      await handleError(saved ? new AppError('BILL_PLAN_REFRESH_FAILED', error) : error,
        'BILL_PLAN_CHANGE_UNCONFIRMED', { operation: 'billing.additional-plan.add' });
    } finally {
      billingMutationInFlight.current = false;
      setAdditionalBillSaving(false);
    }
  };

  const handleCorrectCurrentBillingPlan = async (mismatch: typeof currentBillingPlanMismatches[number]) => {
    if (!editingId || billingMutationInFlight.current || saveInFlight.current || archiveInFlight.current || refundInFlight.current) return;
    if (!confirm(
      `관리용 청구 계획을 '${mismatch.plannedLabel}'에서 실제 지급된 '${mismatch.actualLabel}'으로 정정할까요?\n\n결제금액·결제내역·앱 이용권은 변경되지 않습니다.`,
    )) return;
    billingMutationInFlight.current = true;
    const editorSequence = detailLoadSequence.current;
    let saved = false;
    setBillingPlanCorrectionSaving(true);
    try {
      await correctStudentBillingPlan(mismatch.planId, mismatch.userPackageId, { client: supabase });
      saved = true;
      if (editorSequence !== detailLoadSequence.current) return;
      if (await refreshStudentBillingEditor(editingId, editorSequence)) {
        alert('실제 지급된 이용권 기준으로 관리용 청구 계획을 정정했습니다. 결제내역과 앱 이용권은 변경하지 않았습니다.');
      }
    } catch (error: unknown) {
      if ((saved || error instanceof AppError && error.code === 'BILL_PLAN_CHANGE_UNCONFIRMED')
        && editorSequence === detailLoadSequence.current) closeStudentModal();
      await handleError(saved ? new AppError('BILL_PLAN_REFRESH_FAILED', error) : error,
        'BILL_PLAN_CHANGE_UNCONFIRMED', { operation: 'billing.plan.correct-to-entitlement' });
    } finally {
      billingMutationInFlight.current = false;
      setBillingPlanCorrectionSaving(false);
    }
  };

  // Save or Update Student

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveInFlight.current || archiveInFlight.current || billingMutationInFlight.current || refundInFlight.current) return;
    if (!studentName.trim()) return alert('학생 이름을 입력해주세요.');
    if (!attendanceCode.trim()) return alert('출결번호를 입력해주세요.');
    if (!selectedBranchId) return alert('지점을 선택해주세요.');
    const editingStudent = editingId ? students.find((student) => student.id === editingId) || null : null;
    const isAppLinked = Boolean(editingStudent?.child_id);
    if (isAppLinked && !pickupSpotId && !dropoffSpotId && (pickupDetailLocation.trim() || dropoffDetailLocation.trim())) {
      return alert('상세 승·하차 위치를 입력하려면 먼저 정류장을 선택해 주세요.');
    }
    const assignmentsToValidate = isAppLinked ? nextMonthPackages : classAssignments;
    if (!isAppLinked && assignmentsToValidate.length === 0) return alert('수업 또는 이용권을 한 개 이상 추가해 주세요.');
    if (assignmentsToValidate.some((assignment) => !assignment.package_option_id)) return alert('모든 수강 항목에 이용권 요금제를 지정해 주세요.');
    const assignmentKeys = assignmentsToValidate.map((assignment) => `${assignment.class_schedule_id || 'package-only'}:${assignment.package_option_id}`);
    if (new Set(assignmentKeys).size !== assignmentKeys.length) return alert('동일한 수업반과 이용권 조합이 중복되어 있습니다.');
    if (isAppLinked) {
      if (currentMonthPackages.some((assignment) => !assignment.package_option_id)) {
        return alert('이번 달 청구 이용권을 모두 선택해 주세요.');
      }
      const currentOptionIds = currentMonthPackages.map((assignment) => assignment.package_option_id);
      if (new Set(currentOptionIds).size !== currentOptionIds.length) {
        return alert('이번 달에 동일한 이용권을 중복으로 청구할 수 없습니다.');
      }
      const summary = currentMonthBillingLocked
        ? '학생 정보와 이번 달·다음 달 수업을 함께 저장합니다. 처리된 이번 달 청구 이용권은 변경하지 않습니다.'
        : '학생 정보, 앱의 이번 달 수업, 수납관리 청구 이용권과 다음 달 계획을 함께 저장합니다.';
      if (!confirm(`${studentName} 원생의 변경사항을 저장할까요?\n${summary}`)) return;
    }

    saveInFlight.current = true;
    setSaveLoading(true);
    const editorSequence = detailLoadSequence.current;
    try {
      await saveStudentData({
        editingId,
        editingStudent,
        selectedBranchId,
        studentName,
        parentName,
        attendanceCode,
        motherPhone,
        fatherPhone,
        studentPhone,
        birthDate,
        schoolName,
        gradeLevel,
        address,
        admissionDate,
        memo,
        isSmsEnabled,
        classAssignments,
        pickupSpots,
        pickupSpotId,
        dropoffSpotId,
        pickupDetailLocation,
        dropoffDetailLocation,
        currentMonthClassIds,
        currentMonthPackages,
        applyCurrentClassesToNextMonth,
        nextEffectiveMonth: nextMonthStart(),
        nextMonthClassIds,
        nextMonthPackages,
        currentMonthBillingLocked,
      }, { client: supabase });
      if (editorSequence === detailLoadSequence.current) {
        closeStudentModal();
        void loadData();
      }
    } catch (error: unknown) {
      // A partial/unknown write result must be reviewed via reads, not resubmitted blindly.
      const reviewRequired = requiresStudentSaveReview(error);
      const sameEditor = editorSequence === detailLoadSequence.current;
      if (reviewRequired && sameEditor) closeStudentModal();
      const refreshSequence = detailLoadSequence.current;
      await handleError(error, 'STUDENT_SAVE_FAILED', { operation: 'student.save' });
      if (reviewRequired && sameEditor && refreshSequence === detailLoadSequence.current) void loadData();
    } finally {
      saveInFlight.current = false;
      setSaveLoading(false);
    }
  };

  // Delete Student (모달 오픈)
  const openDeleteModal = (student: Student) => {
    if (archiveInFlight.current) return;
    setTargetStudentForDelete({
      id: student.id,
      name: student.student_name,
      child_id: student.child_id
    });
    setConfirmInputName('');
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!targetStudentForDelete || archiveInFlight.current || saveLoading || deleteLoading || billingMutationInFlight.current || saveInFlight.current || refundInFlight.current) return;
    if (confirmInputName.trim() !== targetStudentForDelete.name.trim()) {
      alert('입력하신 학생 이름이 일치하지 않습니다.');
      return;
    }
    archiveInFlight.current = true;
    const sequence = lifecycleSequence.current;
    let saved = false;
    setDeleteLoading(true);
    try {
      await archiveStudentRecord(targetStudentForDelete.id, '재원 명부에서 제외', { client: supabase });
      saved = true;
      if (sequence !== lifecycleSequence.current) return;
      setDeleteModalOpen(false);
      setTargetStudentForDelete(null);
      if (await refreshStudentLifecycle(sequence)) alert('재원 목록에서 제외했습니다. 기존 청구와 일지는 보존됩니다.');
    } catch (error: unknown) {
      if (sequence === lifecycleSequence.current && error instanceof AppError && error.code === 'STUDENT_ARCHIVE_UNCONFIRMED') setDeleteModalOpen(false);
      await handleError(saved ? new AppError('STUDENT_ACTION_REFRESH_FAILED', error) : error,
        'STUDENT_ARCHIVE_UNCONFIRMED', { operation: 'student.archive' });
    } finally {
      archiveInFlight.current = false;
      setDeleteLoading(false);
    }
  };

  // Download the existing 15-column registration template; no database writes.
  const downloadTemplate = async () => {
    if (templateInFlight.current) return;
    templateInFlight.current = true;
    try {
      const { buildStudentTemplate } = await import('../files/studentTemplate');
      const buffer = await buildStudentTemplate();
      downloadExcel(buffer, '아이패스케어_원생일괄등록_양식.xlsx');
    } catch (error: unknown) {
      await handleError(error, 'EXCEL_EXPORT_FAILED', { operation: 'student.template.export' });
    } finally { templateInFlight.current = false; }
  };

  // Select one explicit branch, parse, preflight, then register without automatic retries.
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || saveInFlight.current || billingMutationInFlight.current || archiveInFlight.current || refundInFlight.current) return;
    const currentBranch = activeBranchId && activeBranchId !== 'all' ? activeBranchId : '';
    if (!currentBranch || !branches.some(branch => branch.id === currentBranch)) {
      alert('상단에서 등록할 지점을 하나 선택해 주세요. 전체 지점에서는 일괄 등록할 수 없습니다.');
      input.value = '';
      return;
    }
    if (!confirm(`선택한 엑셀 파일로 학생 정보를 일괄 업로드하시겠습니까?\n선택된 소속 지점: ${branches.find(b => b.id === currentBranch)?.name}`)) {
      input.value = '';
      return;
    }
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    const sequence = loadSequence.current;
    let parsed = false;
    let registrationResultReceived = false;
    setExcelLoading(true);
    try {
      const { readStudentImport } = await import('../files/studentImport');
      const { importedStudents, mappingRequests } = await readStudentImport(file, currentBranch);
      if (sequence !== loadSequence.current) return;
      if (!importedStudents.length) {
        alert('엑셀 시트에서 등록 가능한 학생 데이터를 발견하지 못했습니다.');
        return;
      }
      parsed = true;
      const result = await importStudents({
        branchId: currentBranch, students: importedStudents, mappings: mappingRequests, classes, options: packageOptions,
      }, { client: supabase, isCurrent: () => sequence === loadSequence.current });
      registrationResultReceived = true;
      alert([
        `학생 등록 확인 ${result.created}명 / 배정 확인 ${result.assigned}건 / 미실행 ${result.notAttempted}명`,
        result.reviewRequired
          ? '일부 결과를 확인하지 못했습니다. 등록되었을 수 있으므로 파일을 다시 올리지 말고 기존 학생과 배정을 먼저 확인해 주세요.'
          : result.notAttempted ? '화면이 변경되어 남은 학생 등록을 중단했습니다. 완료된 내역부터 확인해 주세요.' : '목록과 배정 상태를 확인해 주세요.',
      ].join('\n'));
      for (const error of result.errors) {
        await handleError(error, 'STUDENT_IMPORT_REVIEW_REQUIRED', { operation: 'student.excel.import' });
      }
      if (sequence === loadSequence.current) await loadData();
    } catch (error: unknown) {
      await handleError(error, registrationResultReceived ? 'STUDENT_IMPORT_REVIEW_REQUIRED' : parsed ? 'STUDENT_IMPORT_INVALID' : 'EXCEL_IMPORT_READ_FAILED', { operation: 'student.excel.import' });
    } finally {
      saveInFlight.current = false;
      setExcelLoading(false);
      input.value = '';
    }
  };

  const hasAssignedClass = (student: Student) => {
    if (student.child_id) {
      return (student.app_schedule_classes || []).length > 0;
    }

    return (student.academy_student_classes || []).some((assignment) => (
      (assignment.status || 'active') === 'active'
      && Boolean(assignment.class_schedule_id)
    ));
  };

  const assignedClassStudentCount = students.filter(hasAssignedClass).length;

  // Filter students based on class assignment and search query
  const filteredStudents = students.filter(student => {
    if (assignedClassOnly && !hasAssignedClass(student)) return false;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    
    const assignedClasses = (student.child_id
      ? student.app_schedule_classes || []
      : (student.academy_student_classes || []).map((assignment) => assignment.class_schedules))
      .map((schedule) => schedule?.target_class || '이용권 단독')
      .join(' ');
    const displayParentName = student.parent_user?.name || student.parent_name || '';
    
    return (
      student.student_name.toLowerCase().includes(query) ||
      displayParentName.toLowerCase().includes(query) ||
      (student.mother_phone && student.mother_phone.includes(query)) ||
      (student.father_phone && student.father_phone.includes(query)) ||
      (student.student_phone && student.student_phone.includes(query)) ||
      assignedClasses.toLowerCase().includes(query) ||
      (student.school_name && student.school_name.toLowerCase().includes(query))
    );
  }).sort((left, right) => left.student_name.localeCompare(right.student_name, 'ko-KR'));
  const filteredWithdrawals = withdrawals.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (item.child_name && item.child_name.toLowerCase().includes(query)) ||
      (item.user_name && item.user_name.toLowerCase().includes(query)) ||
      (item.phone && item.phone.includes(query)) ||
      (item.attendance_code && item.attendance_code.includes(query)) ||
      (item.reason && item.reason.toLowerCase().includes(query)) ||
      (item.package_name && item.package_name.toLowerCase().includes(query))
    );
  });
  const filteredUnregisteredMembers = unregisteredMembers.filter((member) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      member.name.toLowerCase().includes(query)
      || (member.username || '').toLowerCase().includes(query)
      || (member.email || '').toLowerCase().includes(query)
      || (member.phone || '').includes(query)
    );
  });

  const modalStudent = editingId ? students.find((student) => student.id === editingId) || null : null;
  const isModalAppLinked = Boolean(modalStudent?.child_id);
  // The global admin view loads every branch's timetable, but a student's
  // enrollment must only ever be edited against that student's selected branch.
  const modalBranchClasses = classes.filter((item) => item.branch_id === selectedBranchId);
  const sortedModalClasses = [...modalBranchClasses].sort((left, right) => {
    const dayDiff = WEEKDAYS.indexOf(normalizedWeekday(left.day_of_week))
      - WEEKDAYS.indexOf(normalizedWeekday(right.day_of_week));
    if (dayDiff !== 0) return dayDiff;
    return `${left.start_time || ''}:${left.target_class}`.localeCompare(`${right.start_time || ''}:${right.target_class}`);
  });
  const availableClassDays = WEEKDAYS.filter((day) => sortedModalClasses.some((item) => normalizedWeekday(item.day_of_week) === day));
  const visibleModalClasses = nextMonthClassDay === '전체'
    ? sortedModalClasses
    : sortedModalClasses.filter((item) => normalizedWeekday(item.day_of_week) === nextMonthClassDay);
  const visibleCurrentMonthClasses = currentMonthClassDay === '전체'
    ? sortedModalClasses
    : sortedModalClasses.filter((item) => normalizedWeekday(item.day_of_week) === currentMonthClassDay);
  const currentMonthPackageGuide = {
    current_plan: { tone: 'border-blue-200 bg-blue-50 text-blue-700', text: currentMonthBillingLocked ? '이번 달 이용권이 이미 갱신 또는 청구 처리되어 잠겨 있습니다. 기존 항목은 변경할 수 없고, 금액 추가가 필요하면 아래 추가 청구를 사용해 주세요.' : '이번 달에 저장해 둔 청구 예정 이용권을 불러왔습니다. 청구 전 초안만 변경할 수 있습니다.' },
    current_bill: { tone: 'border-indigo-200 bg-indigo-50 text-indigo-700', text: '이번 달 청구가 이미 생성되어 기존 이용권은 잠겨 있습니다. 변경분은 추가 청구로만 등록할 수 있습니다.' },
    previous_plan: { tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', text: '지난달에 설정한 관리용 이용권을 이번 달 기본값으로 가져왔습니다. 내용이 맞는지 확인한 후 저장해 주세요.' },
    previous_bill: { tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', text: '지난달에 청구했던 이용권을 이번 달 기본값으로 가져왔습니다. 이용권이 달라졌다면 추가·삭제 후 저장해 주세요.' },
    active_owned: { tone: 'border-amber-200 bg-amber-50 text-amber-700', text: '이번 달 활성 이용권이 있어 기존 청구 구성은 잠겨 있습니다. 새 비용은 추가 청구로 등록해 주세요.' },
    none: { tone: 'border-rose-200 bg-rose-50 text-rose-700', text: '지난달 이용권과 현재 활성 이용권이 없습니다. 이번 달에 청구할 이용권을 직접 추가해 주세요.' },
  }[currentMonthPackageSource];

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            👥 학생 원생 명부 관리
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            원생 정보를 추가하거나, 기존 프로그램의 엑셀 백업 파일을 업로드하여 일괄 등록 및 퇴원/탈퇴 회원을 관리합니다.
          </p>
        </div>
        
        {viewTab === 'active' && (
          <div className="flex flex-wrap gap-2.5">
            {/* Template Download Button */}
            <button 
              onClick={downloadTemplate}
              className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs"
            >
              <Download size={16} />
              엑셀 양식 다운로드
            </button>

            {/* Excel Upload Input */}
            <label className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs cursor-pointer">
              <Upload size={16} />
              {excelLoading ? '업로드 처리 중...' : '엑셀 일괄 등록'}
              <input 
                type="file" 
                accept=".xlsx"
                onChange={handleExcelUpload}
                disabled={excelLoading}
                className="hidden"
              />
            </label>

            <button 
              onClick={() => openModal()}
              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm"
            >
              <Plus size={16} />
              학생 직접 등록
            </button>
          </div>
        )}

        {viewTab === 'withdrawn' && (
          <button
            onClick={() => void loadWithdrawals()}
            disabled={withdrawalLoading}
            className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs"
          >
            <RefreshCw size={15} className={withdrawalLoading ? 'animate-spin' : ''} />
            탈퇴 목록 새로고침
          </button>
        )}
      </div>

      {/* Student, childless member, and withdrawal views */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
        <button
          onClick={() => setViewTab('active')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition ${
            viewTab === 'active'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          <span>재원생 명부</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            viewTab === 'active' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {students.length}명
          </span>
        </button>

        <button
          onClick={() => setViewTab('unregistered')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition ${
            viewTab === 'unregistered'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-amber-300"></span>
          <span>자녀 미등록 회원</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            viewTab === 'unregistered' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {unregisteredMembers.length}명
          </span>
        </button>

        <button
          onClick={() => { setViewTab('withdrawn'); loadWithdrawals(); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition ${
            viewTab === 'withdrawn'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-rose-400"></span>
          <span>퇴원 · 탈퇴 회원 관리</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            viewTab === 'withdrawn' ? 'bg-rose-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {withdrawals.length}명
          </span>
        </button>
      </div>

      {/* Toolbar Search & Filters */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder={viewTab === 'active'
              ? '학생·보호자 이름, 연락처, 소속반, 학교명으로 검색...'
              : viewTab === 'unregistered'
                ? '회원 이름, 아이디, 연락처, 이메일로 검색...'
                : '퇴원/탈퇴 원생·학부모 이름, 연락처, 사유로 검색...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl bg-slate-100 py-3.5 pl-11 pr-4 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {viewTab === 'active' && (
          <button
            type="button"
            aria-pressed={assignedClassOnly}
            onClick={() => setAssignedClassOnly((current) => !current)}
            className={`flex shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-xs font-black transition ${
              assignedClassOnly
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CheckCircle size={16} />
            수업 반 지정
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${
              assignedClassOnly ? 'bg-blue-700 text-white' : 'bg-white text-slate-600'
            }`}>
              {assignedClassStudentCount}명
            </span>
          </button>
        )}
      </div>

      {/* 🟢 VIEW 1: 재원생 명부 테이블 */}
      {viewTab === 'active' && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
                <tr className="whitespace-nowrap">
                  <th scope="col" className="px-6 py-4">학생이름</th>
                  <th scope="col" className="px-6 py-4">보호자 성함</th>
                  <th scope="col" className="px-6 py-4">수강 수업반</th>
                  <th scope="col" className="px-6 py-4">연락처 (부모/학생)</th>
                  <th scope="col" className="px-6 py-4">학교 / 학년</th>
                  <th scope="col" className="px-6 py-4">입회일</th>
                  <th scope="col" className="px-6 py-4">어플 연동 여부</th>
                  <th scope="col" className="px-6 py-4 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16">
                      <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                      <span className="text-xs font-bold text-slate-400 block mt-2">원생 명부 불러오는 중...</span>
                    </td>
                  </tr>
                ) : filteredStudents.length > 0 ? (
                  filteredStudents.map((student) => {
                    const hasAppLinked = student.parent_user_id !== null;
                    const assignments = student.child_id
                      ? (student.app_schedule_classes || []).map((schedule) => ({
                          class_schedule_id: schedule.id,
                          package_option_id: null,
                          class_schedules: schedule,
                        }))
                      : student.academy_student_classes || [];
                    const displayParentName = student.parent_user?.name || student.parent_name || '미기입';
                    
                    return (
                      <tr key={student.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-slate-900 text-sm">{student.student_name}</span>
                            <span className="text-[11px] text-slate-400 font-mono">출결번호: {student.attendance_code}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-extrabold text-slate-900">
                          {displayParentName}
                          {student.parent_user?.name && <span className="ml-1 text-[10px] font-bold text-blue-500">(App)</span>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex max-w-xs flex-wrap gap-1.5">
                            {assignments.length > 0 ? assignments.map((assignment, index) => (
                              <span key={`${assignment.class_schedule_id || 'package'}-${assignment.package_option_id || index}`} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${assignment.class_schedule_id ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                                {assignment.class_schedules?.target_class || '🎫 이용권 단독 수강'}
                              </span>
                            )) : <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-400">미배정</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-700 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            {student.mother_phone && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">어머니</span>
                                <span className="font-mono text-slate-800 font-bold">{student.mother_phone}</span>
                              </div>
                            )}
                            {student.father_phone && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">아버지</span>
                                <span className="font-mono text-slate-800 font-bold">{student.father_phone}</span>
                              </div>
                            )}
                            {student.student_phone && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200/60">학생</span>
                                <span className="font-mono text-slate-800 font-bold">{student.student_phone}</span>
                              </div>
                            )}
                            {!student.mother_phone && !student.father_phone && !student.student_phone && (
                              <span className="text-slate-400 font-medium text-xs">미등록</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs whitespace-nowrap">
                          <div className="flex flex-col font-bold">
                            <span>{student.school_name || '-'}</span>
                            <span className="text-slate-400 mt-0.5">{student.grade_level || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {student.admission_date ? student.admission_date.slice(0, 10).replace(/-/g, '.') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {hasAppLinked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-full border border-emerald-100">
                              <Link2 size={12} />
                              연동 완료 (@{student.parent_user?.name})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-400 font-bold px-2.5 py-1 rounded-full border border-slate-200/50">
                              <Link2Off size={12} />
                              앱 미가입
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex justify-end items-center gap-1.5">
                            <button
                              onClick={() => openModal(student)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50/80 hover:bg-blue-100/90 border border-blue-200/60 rounded-lg transition shadow-2xs"
                              title="원생 정보 수정"
                            >
                              <Pencil size={12} />
                              <span>수정</span>
                            </button>
                            <button
                              onClick={() => openDeleteModal(student)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-600 bg-rose-50/80 hover:bg-rose-100/90 border border-rose-200/60 rounded-lg transition shadow-2xs"
                              title="재원 목록에서 제외"
                            >
                              <Trash2 size={12} />
                              <span>삭제</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center py-20 text-slate-400 font-bold text-sm bg-slate-50/10">
                      일치하는 학생 정보가 없습니다. 첫 원생을 등록해 보세요!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🟠 VIEW 2: 자녀 미등록 회원 */}
      {viewTab === 'unregistered' && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-amber-100 bg-amber-50/60 px-6 py-4">
            <p className="text-xs font-bold text-amber-800">
              앱에는 가입했지만 현재 등록된 자녀가 없는 일반 회원입니다. 재원생 수에는 포함되지 않습니다.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-700">
                <tr className="whitespace-nowrap">
                  <th scope="col" className="px-6 py-4">회원 이름</th>
                  <th scope="col" className="px-6 py-4">아이디</th>
                  <th scope="col" className="px-6 py-4">연락처</th>
                  <th scope="col" className="px-6 py-4">이메일</th>
                  <th scope="col" className="px-6 py-4">소속 지점</th>
                  <th scope="col" className="px-6 py-4">가입일</th>
                  <th scope="col" className="px-6 py-4">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="mx-auto animate-spin text-amber-500" size={24} /></td></tr>
                ) : filteredUnregisteredMembers.length > 0 ? (
                  filteredUnregisteredMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-amber-50/20">
                      <td className="px-6 py-4 font-extrabold text-slate-900">{member.name}</td>
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-600">{member.username || '-'}</td>
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{member.phone || '-'}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-600">{member.email || '-'}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-700">{branches.find((branch) => branch.id === member.branch_id)?.name || '미정'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-700">{member.created_at ? member.created_at.slice(0, 10).replace(/-/g, '.') : '-'}</td>
                      <td className="px-6 py-4"><span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">자녀 미등록</span></td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={7} className="bg-slate-50/10 py-20 text-center text-sm font-bold text-slate-400">해당하는 자녀 미등록 회원이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🔴 VIEW 3: 퇴원 · 탈퇴 회원 관리 테이블 */}
      {viewTab === 'withdrawn' && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="bg-rose-50/60 text-xs font-bold uppercase text-slate-700 border-b border-slate-200">
                <tr className="whitespace-nowrap">
                  <th scope="col" className="px-6 py-4">원생 / 출결번호</th>
                  <th scope="col" className="px-6 py-4">보호자 / 연락처</th>
                  <th scope="col" className="px-6 py-4">퇴원·탈퇴일시 / 경로</th>
                  <th scope="col" className="px-6 py-4">퇴원·탈퇴 사유</th>
                  <th scope="col" className="px-6 py-4">당시 이용권 & 결제내역</th>
                  <th scope="col" className="px-6 py-4">환불 정산 상태</th>
                  <th scope="col" className="px-6 py-4 text-right">정산 관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                {withdrawalLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16">
                      <Loader2 className="animate-spin text-rose-500 mx-auto" size={24} />
                      <span className="text-xs font-bold text-slate-400 block mt-2">퇴원·탈퇴 회원 명부 불러오는 중...</span>
                    </td>
                  </tr>
                ) : filteredWithdrawals.length > 0 ? (
                  filteredWithdrawals.map((item) => {
                    const formattedDate = item.created_at ? item.created_at.slice(0, 16).replace('T', ' ') : '-';
                    const isAccountWithdrawal = item.event_type === 'account_withdrawal'
                      || (!item.event_type && item.source === 'app');
                    
                    return (
                      <tr key={item.id} className="hover:bg-rose-50/20 transition">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-extrabold text-slate-900 text-sm">
                              {isAccountWithdrawal ? '회원 계정 전체 탈퇴' : (item.child_name || '원생 미지정')}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {branches.find(b => b.id === item.branch_id)?.name && (
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  {branches.find(b => b.id === item.branch_id)?.name}
                                </span>
                              )}
                              {isAccountWithdrawal ? (
                                <span className="text-[11px] text-slate-400 font-semibold">자녀 전체 포함 · 계정 단위 처리</span>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-mono">출결코드: #{item.attendance_code || '-'}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 text-xs">{item.user_name || '학부모'}</span>
                            <span className="text-[11px] text-slate-600 font-mono font-bold mt-0.5">{item.phone || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-slate-700 font-mono">{formattedDate}</span>
                            {isAccountWithdrawal ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-100 w-fit">
                                📱 회원 탈퇴
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200 w-fit">
                                🏫 학원 퇴원
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col max-w-xs">
                            <span className="font-bold text-slate-900 text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded w-fit">
                              {item.reason}
                            </span>
                            {item.reason_detail && (
                              <span className="text-[11px] text-slate-500 mt-1 truncate" title={item.reason_detail}>
                                {item.reason_detail}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {item.package_name ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-extrabold text-slate-900 text-xs">🎫 {item.package_name}</span>
                              <span className="text-[11px] text-slate-600">
                                실결제액: <b className="text-slate-900">{item.paid_amount ? item.paid_amount.toLocaleString() : 0}원</b>
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">
                                총 {item.total_count || 0}회 중 {item.used_count || 0}회 출석 (잔여 <b className="text-rose-600">{item.remaining_count || 0}회</b>)
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">보유 이용권 없음</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.refund_status === 'completed' ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 font-black px-2.5 py-1 rounded-full border border-emerald-200 w-fit">
                                <CheckCircle size={12} />
                                환불 완료 ({item.refund_amount ? item.refund_amount.toLocaleString() : 0}원)
                              </span>
                              {item.refund_memo && (
                                <span className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[150px]" title={item.refund_memo}>
                                  {item.refund_memo}
                                </span>
                              )}
                            </div>
                          ) : item.refund_status === 'pending' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-700 font-black px-2.5 py-1 rounded-full border border-amber-200 w-fit">
                              <Clock size={12} />
                              환불 대기
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-500 font-bold px-2.5 py-1 rounded-full border border-slate-200 w-fit">
                              환불 없음
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {item.is_inferred ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                              조회 기록
                            </span>
                          ) : (
                            <button
                              onClick={() => openRefundModal(item)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition shadow-2xs"
                            >
                              <CreditCard size={13} />
                              <span>환불 처리</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-20 text-slate-400 font-bold text-sm bg-slate-50/10">
                      퇴원 및 탈퇴 처리된 회원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 💳 REFUND PROCESS MODAL (환불 정산 입력 팝업) */}
      {refundModalOpen && selectedWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">퇴원 회원 환불 정산</h3>
                  <p className="text-xs text-slate-500">
                    {selectedWithdrawal.event_type === 'account_withdrawal'
                      ? `${selectedWithdrawal.user_name || '탈퇴 회원'} · 회원 계정 전체 탈퇴`
                      : `${selectedWithdrawal.child_name || '원생 미지정'} (${selectedWithdrawal.user_name || '학부모'} 학부모)`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setRefundModalOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* 결제 및 출석 참고 카드 */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200/70 p-4 mb-5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">당시 보유 이용권:</span>
                <span className="font-extrabold text-slate-900">{selectedWithdrawal.package_name || '이용권 없음'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">과거 실결제액:</span>
                <span className="font-extrabold text-blue-600 font-mono">{selectedWithdrawal.paid_amount ? selectedWithdrawal.paid_amount.toLocaleString() : 0}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">수업 출석 현황:</span>
                <span className="font-extrabold text-slate-800">
                  총 {selectedWithdrawal.total_count || 0}회 중 {selectedWithdrawal.used_count || 0}회 등원 (잔여 <b className="text-rose-600">{selectedWithdrawal.remaining_count || 0}회</b>)
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">환불 정산 상태 *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'pending', label: '🟡 환불 대기' },
                    { id: 'completed', label: '🟢 환불 완료' },
                    { id: 'none', label: '⚪ 해당 없음' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setRefundStatus(st.id as any)}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition ${
                        refundStatus === st.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {refundStatus === 'completed' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">실제 환불 금액 (원) *</label>
                  <input
                    type="number"
                    value={refundAmount || ''}
                    onChange={(e) => setRefundAmount(Number(e.target.value))}
                    placeholder="예: 50000"
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">환불 처리 메모</label>
                <textarea
                  value={refundMemo}
                  onChange={(e) => setRefundMemo(e.target.value)}
                  placeholder="예: 위약금 10% 및 교재비 공제 후 학부모 계좌로 환불 송금 완료"
                  rows={2}
                  className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundModalOpen(false)}
                  className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleSaveRefund}
                  disabled={refundSaving}
                  className="w-2/3 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {refundSaving ? <Loader2 size={15} className="animate-spin" /> : null}
                  환불 정산 저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={closeStudentModal}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {editingId ? 'STUDENT EDIT' : 'STUDENT REGISTER'}
                </span>
                <h3 className="mt-2 text-xl font-black text-slate-900">
                  {editingId ? `${studentName} 원생 정보 수정` : '새 원생 개별 등록'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-black text-slate-600">닫기</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Branch */}
              {activeBranchId === null && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">지점 소속 선택 *</label>
                  <select 
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">지점을 선택해주세요</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">학생 이름 *</label>
                  <input 
                    type="text" 
                    placeholder="예: 홍길동"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">보호자(학부모) 성함</label>
                  <input
                    type="text"
                    placeholder="예: 홍길동 (수기 입력용)"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">출결 등원 번호 *</label>
                  <input 
                    type="text" 
                    placeholder="예: 1234"
                    value={attendanceCode}
                    onChange={(e) => setAttendanceCode(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
              </div>

              <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
                {isModalAppLinked && (
                  <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                    <button type="button" onClick={() => setCourseTab('current')} className={`rounded-lg px-3 py-2 text-xs font-black ${courseTab === 'current' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>이번 달<br/><span className="text-[10px]">{monthLabel(0)}</span></button>
                    <button type="button" onClick={() => setCourseTab('next')} className={`rounded-lg px-3 py-2 text-xs font-black ${courseTab === 'next' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>다음 달<br/><span className="text-[10px]">{monthLabel(1)}</span></button>
                  </div>
                )}
                {isModalAppLinked && courseTab === 'current' ? (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <div><div className="text-xs font-black text-slate-800">이번 달 수업·청구 이용권</div><div className="mt-0.5 text-[10px] font-medium text-slate-500">저장하면 처리된 수업은 보존하고, 남은 이번 달 수업은 실제 앱 일정에도 반영됩니다.</div></div>
                    <div className="space-y-3 rounded-2xl border border-blue-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div><div className="text-[11px] font-black text-blue-700">이번 달 수업 선택</div><div className="text-[10px] font-medium text-slate-500">선택 {currentMonthClassIds.length}개</div></div>
                        {currentMonthClassIds.length > 0 && <button type="button" disabled={saveLoading} onClick={() => setCurrentMonthClassIds([])} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 disabled:opacity-50">전체 해제</button>}
                      </div>

                      {currentMonthClassIds.length > 0 && (
                        <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-blue-50 p-2">
                          {currentMonthClassIds.map((id) => {
                            const selected = classes.find((item) => item.id === id);
                            return selected ? <button key={id} type="button" disabled={saveLoading} onClick={() => setCurrentMonthClassIds((current) => current.filter((itemId) => itemId !== id))} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-blue-700 shadow-xs disabled:opacity-50">{normalizedWeekday(selected.day_of_week)} {selected.start_time?.slice(0, 5)} · {selected.target_class} ×</button> : null;
                          })}
                        </div>
                      )}

                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {['전체', ...availableClassDays].map((day) => <button key={day} type="button" onClick={() => setCurrentMonthClassDay(day)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ${currentMonthClassDay === day ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{day}{day !== '전체' ? '요일' : ''}</button>)}
                      </div>

                      <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                        {visibleCurrentMonthClasses.map((schedule) => {
                          const checked = currentMonthClassIds.includes(schedule.id);
                          return <label key={schedule.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-blue-300 bg-blue-50' : 'border-transparent bg-slate-50 hover:border-slate-200'}`}>
                            <input type="checkbox" checked={checked} disabled={saveLoading} onChange={(event) => setCurrentMonthClassIds((current) => event.target.checked ? Array.from(new Set([...current, schedule.id])) : current.filter((id) => id !== schedule.id))} className="h-4 w-4 shrink-0 accent-blue-600"/>
                            <span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{schedule.target_class}</span><span className="mt-0.5 block text-[10px] font-bold text-slate-500">{normalizedWeekday(schedule.day_of_week)}요일 · {schedule.start_time?.slice(0, 5) || '--:--'}~{schedule.end_time?.slice(0, 5) || '--:--'}</span></span>
                          </label>;
                        })}
                        {visibleCurrentMonthClasses.length === 0 && <div className="col-span-full rounded-xl bg-slate-50 py-6 text-center text-xs font-bold text-slate-400">해당 요일의 수업이 없습니다.</div>}
                      </div>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-900">
                        <input type="checkbox" checked={applyCurrentClassesToNextMonth} onChange={(event) => setApplyCurrentClassesToNextMonth(event.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600"/>
                        <span><span className="block font-black">다음 달에도 같은 수업 시간표 적용</span><span className="mt-0.5 block text-[10px] font-medium text-violet-700">체크하면 다음 달에 저장된 수업 일정은 현재 선택으로 교체됩니다. 이용권·청구는 변경되지 않습니다.</span></span>
                      </label>
                    </div>
                    <div>
                      <div className="mb-1.5 text-[11px] font-black text-slate-500">실제 지급 이용권(참고)</div>
                      <div className="flex flex-wrap gap-1.5">{currentPackageLabels.length > 0 ? currentPackageLabels.map((label) => <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{label}</span>) : <span className="text-xs font-bold text-slate-400">지급된 이용권 없음</span>}</div>
                      <div className="mt-1 text-[10px] font-bold text-rose-500">아래 관리용 이용권을 수정해도 실제 지급 이용권은 생성·변경되지 않습니다.</div>
                      {currentBillingPlanMismatches.map((mismatch) => (
                        <div key={mismatch.planId} className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <div className="text-[11px] font-black text-rose-700">관리용 이용권과 실제 지급 이용권이 다릅니다.</div>
                          <div className="mt-1 text-[10px] font-bold leading-5 text-rose-600">관리용: {mismatch.plannedLabel}<br/>실제 지급: {mismatch.actualLabel}</div>
                          <button type="button" onClick={() => void handleCorrectCurrentBillingPlan(mismatch)} disabled={billingPlanCorrectionSaving || saveLoading} className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[10px] font-black text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">
                            {billingPlanCorrectionSaving ? '정정 중...' : '실제 이용권으로 정정'}
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-slate-100 pt-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div><div className="text-[11px] font-black text-emerald-700">현재 관리용 이용권 · 이번 달 청구 예정</div><div className="text-[10px] text-slate-500">이번 달 저장값이 없으면 지난달 구성을 기본으로 불러옵니다. 저장 시 청구대상 관리에 반영됩니다.</div></div>
                        <button type="button" disabled={saveLoading || currentMonthBillingLocked} onClick={() => setCurrentMonthPackages((current) => [...current, emptyAssignment()])} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Plus size={12}/> 이용권 추가</button>
                      </div>
                      <div className={`mb-3 rounded-xl border px-3 py-2.5 text-[10px] font-bold leading-5 ${currentMonthPackageGuide.tone}`}>
                        <span className="mr-1">안내:</span>{currentMonthPackageGuide.text}
                      </div>
                      <div className="space-y-2">
                        {currentMonthPackages.map((assignment, index) => {
                          const selected = packageOptions.find((option) => option.id === assignment.package_option_id);
                          return <div key={index} className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-2">
                            <select value={assignment.package_option_id} disabled={saveLoading || currentMonthBillingLocked} onChange={(event) => setCurrentMonthPackages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, package_option_id: event.target.value } : item))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none disabled:bg-slate-100">
                              <option value="">이용권을 선택해 주세요</option>
                              {packageOptions.map((option) => <option key={option.id} value={option.id}>[{voucherTypeLabel(option.packages?.voucher_type)}] {option.packages?.name || '패키지'} · {option.label} ({option.price.toLocaleString()}원)</option>)}
                            </select>
                            {selected && <span className="hidden shrink-0 text-[10px] font-black text-emerald-700 sm:block">{selected.price.toLocaleString()}원</span>}
                            <button type="button" disabled={saveLoading || currentMonthBillingLocked} aria-label="이번 달 청구 이용권 삭제" onClick={() => setCurrentMonthPackages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:text-slate-300"><Trash2 size={14}/></button>
                          </div>;
                        })}
                        {currentMonthPackages.length === 0 && <div className="rounded-xl bg-slate-50 py-4 text-center text-[11px] font-bold text-slate-400">이번 달 청구 이용권이 없습니다.</div>}
                      </div>
                      {currentMonthBillingLocked && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="mb-2 text-[11px] font-black text-amber-800">기존 청구와 별도로 추가 청구</div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select value={additionalPackageOptionId} disabled={additionalBillSaving} onChange={(event) => setAdditionalPackageOptionId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none disabled:bg-slate-100">
                            <option value="">추가 청구할 이용권을 선택해 주세요</option>
                            {packageOptions.filter((option) => !currentMonthPackages.some((item) => item.package_option_id === option.id)).map((option) => <option key={option.id} value={option.id}>[{voucherTypeLabel(option.packages?.voucher_type)}] {option.packages?.name || '패키지'} · {option.label} ({option.price.toLocaleString()}원)</option>)}
                          </select>
                          <button type="button" disabled={additionalBillSaving || !additionalPackageOptionId} onClick={() => void handleAddCurrentMonthAdditionalBill()} className="flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Plus size={13}/> 추가 청구 등록</button>
                        </div>
                      </div>}
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                        <span className="text-xs font-black text-slate-600">총 청구액 {packageOptions.filter((option) => currentMonthPackages.some((item) => item.package_option_id === option.id)).reduce((sum, option) => sum + option.price, 0).toLocaleString()}원</span>
                        <span className="text-[10px] font-bold text-violet-600">하단의 변경사항 저장 버튼으로 함께 반영됩니다.</span>
                      </div>
                    </div>
                  </div>
                ) : (
                <>
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-xs font-black text-slate-800">{isModalAppLinked ? `${monthLabel(1)} 수업 및 이용권` : '수강 수업반 및 요금제'}</div><div className="mt-0.5 text-[10px] font-medium text-slate-500">{isModalAppLinked ? '저장한 이용권은 구매 여부와 관계없이 변경하거나 해지할 때까지 다음 달 청구 대상으로 이어집니다.' : '학생이 수강하는 수업을 여러 개 등록할 수 있습니다.'}</div></div>
                  {!isModalAppLinked && <button type="button" onClick={() => setClassAssignments((current) => [...current, emptyAssignment()])} className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white hover:bg-blue-700"><Plus size={14} /> 항목 추가</button>}
                </div>
                {isModalAppLinked && (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-black text-blue-700">다음 달 수업 선택</div>
                        <div className="text-[10px] font-medium text-slate-500">선택 {nextMonthClassIds.length}개</div>
                      </div>
                      {nextMonthClassIds.length > 0 && <button type="button" onClick={() => setNextMonthClassIds([])} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">전체 해제</button>}
                    </div>

                    {nextMonthClassIds.length > 0 && (
                      <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-blue-50 p-2">
                        {nextMonthClassIds.map((id) => {
                          const selected = classes.find((item) => item.id === id);
                          return selected ? <button key={id} type="button" onClick={() => setNextMonthClassIds((current) => current.filter((itemId) => itemId !== id))} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-blue-700 shadow-xs">{normalizedWeekday(selected.day_of_week)} {selected.start_time?.slice(0, 5)} · {selected.target_class} ×</button> : null;
                        })}
                      </div>
                    )}

                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {['전체', ...availableClassDays].map((day) => <button key={day} type="button" onClick={() => setNextMonthClassDay(day)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ${nextMonthClassDay === day ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{day}{day !== '전체' ? '요일' : ''}</button>)}
                    </div>

                    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {visibleModalClasses.map((item) => {
                        const checked = nextMonthClassIds.includes(item.id);
                        return <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-blue-300 bg-blue-50' : 'border-transparent bg-slate-50 hover:border-slate-200'}`}>
                          <input type="checkbox" checked={checked} onChange={(e) => setNextMonthClassIds((current) => e.target.checked ? Array.from(new Set([...current, item.id])) : current.filter((id) => id !== item.id))} className="h-4 w-4 shrink-0 rounded text-blue-600"/>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-black text-slate-800">{item.target_class}</span>
                            <span className="mt-0.5 block text-[10px] font-bold text-slate-500">{normalizedWeekday(item.day_of_week)}요일 · {item.start_time?.slice(0, 5) || '--:--'}~{item.end_time?.slice(0, 5) || '--:--'}</span>
                          </span>
                        </label>;
                      })}
                      {visibleModalClasses.length === 0 && <div className="col-span-full rounded-xl bg-slate-50 py-6 text-center text-xs font-bold text-slate-400">해당 요일의 수업이 없습니다.</div>}
                    </div>
                  </div>
                )}
                {isModalAppLinked && <>
                  <div className="flex items-center justify-between"><div><div className="text-[11px] font-black text-emerald-700">다음 달 청구 이용권</div><div className="text-[10px] text-slate-500">차량·단품을 포함해 여러 개 추가할 수 있습니다.</div></div><button type="button" onClick={() => { setNextMonthPackages((current) => [...current, emptyAssignment()]); setNextMonthPackageSource('edited'); }} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black text-white"><Plus size={12}/> 이용권 추가</button></div>
                  {nextMonthPackageSource === 'preview' && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold leading-4 text-amber-800">현재 이용권을 기준으로 미리 채운 값이며 아직 다음 달 청구 대상으로 저장되지 않았습니다. 아래 전체 저장을 눌러야 수납관리에 반영됩니다.</div>}
                  {nextMonthPackageSource === 'edited' && <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold leading-4 text-blue-700">변경한 내용은 아직 저장 전입니다. 아래 전체 저장을 누르면 다음 달 수납관리에 반영됩니다.</div>}
                  {(nextMonthPackageSource === 'saved_month' || nextMonthPackageSource === 'saved_recurring') && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold leading-4 text-emerald-700">다음 달 청구 대상으로 저장된 구성입니다.</div>}
                </>}
                {(isModalAppLinked ? nextMonthPackages : classAssignments).map((assignment, index) => {
                  const selectablePackageOptions = isModalAppLinked
                    ? packageOptions
                    : packageOptions.filter((option) => (option.packages?.voucher_type || 'lesson') === 'lesson');
                  const selectedPackageOption = selectablePackageOptions.find((option) => option.id === assignment.package_option_id);
                  const updateAssignment = (values: Partial<ClassAssignment>) => isModalAppLinked
                    ? (setNextMonthPackages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item)), setNextMonthPackageSource('edited'))
                    : setClassAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
                  const itemCount = isModalAppLinked ? nextMonthPackages.length : classAssignments.length;
                  return (
                    <div key={index} className={`space-y-3 rounded-2xl border p-3 ${isModalAppLinked ? 'border-emerald-100 bg-gradient-to-br from-white to-emerald-50/60' : 'border-slate-200 bg-white'} shadow-xs`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${isModalAppLinked ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{index + 1}</span>
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-black text-slate-700">{selectedPackageOption?.packages?.name || (isModalAppLinked ? '청구할 이용권을 선택하세요' : `수강 항목 ${index + 1}`)}</div>
                            {selectedPackageOption && <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><span className="rounded-full bg-white px-1.5 py-0.5 text-emerald-700">{voucherTypeLabel(selectedPackageOption.packages?.voucher_type)}</span><span>{selectedPackageOption.label}</span><span>·</span><span>{selectedPackageOption.price.toLocaleString()}원</span></div>}
                          </div>
                        </div>
                        {(isModalAppLinked || itemCount > 1) && <button type="button" aria-label="이용권 삭제" onClick={() => { if (isModalAppLinked) { setNextMonthPackages((current) => current.filter((_, itemIndex) => itemIndex !== index)); setNextMonthPackageSource('edited'); } else { setClassAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index)); } }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>}
                      </div>
                      <div className={`grid grid-cols-1 gap-3 ${isModalAppLinked ? '' : 'sm:grid-cols-2'}`}>
                        {!isModalAppLinked && <div><label className="mb-1.5 block text-xs font-bold text-slate-500">수강 반 배정 (선택)</label><select value={assignment.class_schedule_id} onChange={(e) => updateAssignment({ class_schedule_id: e.target.value })} className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"><option value="">수업반 없음 / 이용권 단독 수강</option>{modalBranchClasses.map((item) => <option key={item.id} value={item.id}>{scheduleLabel(item)}</option>)}</select></div>}
                        <div><label className="mb-1.5 block text-[11px] font-bold text-slate-500">{isModalAppLinked ? '이용권 변경' : '이용권 요금제 지정 *'}</label><select value={assignment.package_option_id} onChange={(e) => updateAssignment({ package_option_id: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" required><option value="">이용권을 선택해 주세요</option>{selectablePackageOptions.map((option) => <option key={option.id} value={option.id}>[{voucherTypeLabel(option.packages?.voucher_type)}] {option.packages?.name || '패키지'} · {option.label} ({option.price.toLocaleString()}원)</option>)}</select></div>
                      </div>
                    </div>
                  );
                })}
                </>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">어머니 연락처</label>
                  <input 
                    type="text" 
                    placeholder="01012345678"
                    value={motherPhone}
                    onChange={(e) => setMotherPhone(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">아버지 연락처</label>
                  <input 
                    type="text" 
                    placeholder="01012345678"
                    value={fatherPhone}
                    onChange={(e) => setFatherPhone(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">학생 본인 연락처</label>
                  <input 
                    type="text" 
                    placeholder="01012345678"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">생년월일 (선택)</label>
                  <input 
                    type="date" 
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">학교명 (선택)</label>
                  <input 
                    type="text" 
                    placeholder="예: 가온초"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">학년 (선택)</label>
                  <input 
                    type="text" 
                    placeholder="예: 초등 3학년"
                    value={gradeLevel}
                    onChange={(e) => setGradeLevel(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">입회 등록일 *</label>
                  <input 
                    type="date" 
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="flex items-center h-full pt-6 pl-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={isSmsEnabled}
                      onChange={(e) => setIsSmsEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-700">등하원 문자 자동 수신 활성화</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">학생 거주지 주소</label>
                <input 
                  type="text" 
                  placeholder="예: 서울특별시 서초구 반포동 123"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">비공개 학생 메모</label>
                <textarea 
                  placeholder="원장 작성용 비공개 학생 특이사항 메모"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold border-none outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-2.5 mt-6">
                {editingId && modalStudent && (
                  <button
                    type="button"
                    onClick={() => handleDepartStudent(modalStudent)}
                    disabled={saveLoading}
                    className="flex w-1/3 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 py-3.5 text-xs font-black text-rose-700 transition"
                    title="해당 원생을 퇴원·탈퇴 회원으로 이동 처리"
                  >
                    <LogOut size={15} />
                    퇴원(탈퇴) 처리
                  </button>
                )}
                <button 
                  type="submit" 
                  disabled={saveLoading || pickupSettingsLoading}
                  className={`flex ${editingId ? 'w-2/3' : 'w-full'} items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-blue-300 shadow-sm`}
                >
                  {saveLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {editingId ? (isModalAppLinked ? '변경사항 저장' : '학생 정보 수정 완료하기') : '학생 정보 등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 재원 목록 제외 이중 확인 */}
      {deleteModalOpen && targetStudentForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
            {/* Header */}
            <div className="bg-rose-50 px-6 py-4 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-rose-950">재원 목록에서 제외</h3>
                  <p className="text-xs text-rose-700 font-medium">실수 방지를 위한 이중 안전 확인</p>
                </div>
              </div>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">대상 원생:</span>
                  <span className="font-bold text-slate-900">{targetStudentForDelete.name}</span>
                </div>
                <div className="text-xs text-rose-600 pt-1.5 border-t border-slate-200/60 font-medium leading-relaxed">
                  남은 이용권과 미사용 예약은 종료되며, 기존 청구와 일지 기록은 보존됩니다.
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  재원 목록에서 제외하려면 아래에 <span className="text-rose-600 underline font-black">[{targetStudentForDelete.name}]</span> 을(를) 똑같이 입력해 주세요.
                </label>
                <input
                  type="text"
                  value={confirmInputName}
                  onChange={(e) => setConfirmInputName(e.target.value)}
                  placeholder={targetStudentForDelete.name}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition"
                  autoFocus
                />
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={confirmInputName.trim() !== targetStudentForDelete.name.trim() || deleteLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition shadow-sm"
              >
                {deleteLoading ? '처리 중...' : '재원 목록에서 제외'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
