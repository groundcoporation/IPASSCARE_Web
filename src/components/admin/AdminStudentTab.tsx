import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Pencil, Trash2, Search, Upload, Loader2, Link2, Link2Off, Download, UserX, CheckCircle, Clock, AlertCircle, AlertTriangle, RefreshCw, X, CreditCard, LogOut } from 'lucide-react';
import ExcelJS from 'exceljs';
import { loadActiveAppSchedulesByChild, type ActiveAppSchedule } from '../../lib/adminScheduleAssignments';

export interface WithdrawalRecord {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  phone?: string | null;
  child_id?: string | null;
  child_name?: string | null;
  attendance_code?: string | null;
  branch_id?: string | null;
  reason: string;
  reason_detail?: string | null;
  source: 'app' | 'admin';
  event_type?: 'academy_withdrawal' | 'account_withdrawal' | null;
  package_name?: string | null;
  paid_amount?: number;
  total_count?: number;
  used_count?: number;
  remaining_count?: number;
  refund_status: 'pending' | 'completed' | 'none';
  refund_amount?: number;
  refund_memo?: string | null;
  refunded_at?: string | null;
  created_at: string;
  /** user_withdrawals에 실제 저장된 행인지, 기존 앱 삭제 상태를 복원한 조회용 행인지 구분 */
  is_inferred?: boolean;
}

interface Student {
  id: string;
  parent_user_id: string | null;
  child_id: string | null;
  branch_id: string;
  student_name: string;
  parent_name: string | null;
  attendance_code: string;
  mother_phone: string | null;
  father_phone: string | null;
  student_phone: string | null;
  birth_date: string | null;
  school_name: string | null;
  grade_level: string | null;
  address: string | null;
  admission_date: string | null;
  memo: string | null;
  is_sms_enabled: boolean;
  created_at: string;
  // App linking join fields
  parent_user?: {
    name: string;
    email: string;
    status: string;
  } | null;
  child?: {
    deleted_at: string | null;
  } | null;
  // Joined classes
  academy_student_classes?: Array<{
    class_schedule_id: string | null;
    package_option_id: string | null;
    billing_cycle: string | null;
    payment_day: string | null;
    status: string | null;
    class_schedules: {
      target_class: string;
    } | null;
  }>;
  app_schedule_classes?: ActiveAppSchedule[];
  active_package?: {
    package_name: string;
    total_count: number;
    remaining_count: number;
    price?: number;
  } | null;
}

interface UnregisteredMember {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  branch_id: string | null;
  created_at: string;
}

interface ClassSchedule {
  id: string;
  target_class: string;
  branch_id: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface PackageOption {
  id: string;
  label: string;
  price: number;
  branch_id: string;
  packages: {
    name: string;
    voucher_type: string | null;
  } | null;
}

interface ClassAssignment {
  class_schedule_id: string;
  package_option_id: string;
  billing_cycle: string;
  payment_day: string;
}

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
  const [classAssignments, setClassAssignments] = useState<ClassAssignment[]>([emptyAssignment()]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [courseTab, setCourseTab] = useState<'current' | 'next'>('current');
  const [nextMonthClassIds, setNextMonthClassIds] = useState<string[]>([]);
  const [nextMonthClassDay, setNextMonthClassDay] = useState('전체');
  const [nextMonthPackages, setNextMonthPackages] = useState<ClassAssignment[]>([]);
  const [currentMonthPackages, setCurrentMonthPackages] = useState<ClassAssignment[]>([]);
  const [currentMonthPackageSource, setCurrentMonthPackageSource] = useState<'current_plan' | 'current_bill' | 'previous_plan' | 'previous_bill' | 'active_owned' | 'none'>('none');
  const [currentMonthClassIds, setCurrentMonthClassIds] = useState<string[]>([]);
  const [currentMonthClassDay, setCurrentMonthClassDay] = useState('전체');
  const [currentMonthBillSaving, setCurrentMonthBillSaving] = useState(false);
  const [currentPackageLabels, setCurrentPackageLabels] = useState<string[]>([]);
  const [currentEditingStudent, setCurrentEditingStudent] = useState<Student | null>(null);

  // 🚀 Top View Tab: 'active' (재원생 명부) | 'withdrawn' (퇴원·탈퇴 회원)
  const [viewTab, setViewTab] = useState<'active' | 'unregistered' | 'withdrawn'>('active');
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRecord | null>(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundStatus, setRefundStatus] = useState<'pending' | 'completed' | 'none'>('pending');
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundMemo, setRefundMemo] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);

  // Load students, classes, & package options
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load class schedules for assigning
      let classesQuery = supabase.from('class_schedules').select('id, target_class, branch_id, day_of_week, start_time, end_time');
      if (activeBranchId && activeBranchId !== 'all') {
        classesQuery = classesQuery.eq('branch_id', activeBranchId);
      }
      const { data: classesData } = await classesQuery;
      setClasses((classesData || []) as ClassSchedule[]);

      // 2. Load every package category with its options
      let packagesQuery = supabase.from('packages').select(`
        id,
        name,
        voucher_type,
        branch_id,
        package_options(id, label, price, branch_id)
      `);
      if (activeBranchId && activeBranchId !== 'all') {
        packagesQuery = packagesQuery.eq('branch_id', activeBranchId);
      }
      const { data: packageData } = await packagesQuery;
      const flattenedOptions = ((packageData || []) as any[]).flatMap((pkg) =>
        (pkg.package_options || []).map((option: any) => ({
          ...option,
          branch_id: option.branch_id || pkg.branch_id,
          packages: {
            name: pkg.name,
            voucher_type: pkg.voucher_type || 'lesson',
          },
        })),
      );
      setPackageOptions(flattenedOptions);

      // 3. Load actual students from academy_students and children.
      // Registered users without a child belong in member management, not the student roster.
      let studentsQuery = supabase.from('academy_students').select(`
        *,
        parent_user:users(name, email, status, phone, branch_id),
        child:children(deleted_at, back_number, branch_id)
      `);
      if (activeBranchId && activeBranchId !== 'all') {
        studentsQuery = studentsQuery.eq('branch_id', activeBranchId);
      }

      let childrenQuery = supabase.from('children').select(`
        id, child_name, back_number, parent_id, branch_id, deleted_at, created_at,
        parent:users(id, name, phone, email, status, branch_id)
      `).is('deleted_at', null);
      if (activeBranchId && activeBranchId !== 'all') {
        childrenQuery = childrenQuery.eq('branch_id', activeBranchId);
      }

      let usersQuery = supabase
        .from('users')
        .select('id, name, username, email, phone, status, role, branch_id, created_at')
        .neq('status', 'deleted');
      if (activeBranchId && activeBranchId !== 'all') {
        usersQuery = usersQuery.eq('branch_id', activeBranchId);
      }

      const [studentsResult, childrenResult, usersResult] = await Promise.all([
        studentsQuery,
        childrenQuery,
        usersQuery,
      ]);

      if (studentsResult.error) throw studentsResult.error;
      if (childrenResult.error) throw childrenResult.error;
      if (usersResult.error) throw usersResult.error;

      const rawAcademyStudents = (studentsResult.data || []) as any[];
      const rawChildren = (childrenResult.data || []) as any[];
      const rawUsers = (usersResult.data || []) as any[];

      // Keep the base academy_students query independent from class joins.
      // A broken/ambiguous nested relationship must not make the entire student list disappear.
      const academyStudentIds = rawAcademyStudents.map((student) => student.id).filter(Boolean);
      const studentClassesByStudent = new Map<string, Student['academy_student_classes']>();
      const currentPlanClassesByStudent = new Map<string, ActiveAppSchedule[]>();
      if (academyStudentIds.length > 0) {
        const [{ data: studentClassesData, error: studentClassesError }, { data: currentPlanClasses, error: currentPlanError }] = await Promise.all([
          supabase
            .from('academy_student_classes')
            .select('student_id, class_schedule_id, package_option_id, billing_cycle, payment_day, status')
            .in('student_id', academyStudentIds),
          supabase
            .from('academy_student_monthly_plans')
            .select('student_id, class_schedule_id')
            .in('student_id', academyStudentIds)
            .eq('effective_month', `${currentBillMonth()}-01`)
            .eq('item_type', 'class')
            .in('status', ['planned', 'applied']),
        ]);

        if (studentClassesError) throw studentClassesError;
        if (currentPlanError) throw currentPlanError;

        const classesById = new Map((classesData || []).map((schedule: any) => [schedule.id, schedule]));
        ((studentClassesData || []) as any[]).forEach((assignment) => {
          const current = studentClassesByStudent.get(assignment.student_id) || [];
          const schedule = assignment.class_schedule_id
            ? classesById.get(assignment.class_schedule_id) || null
            : null;
          current.push({
            class_schedule_id: assignment.class_schedule_id,
            package_option_id: assignment.package_option_id,
            billing_cycle: assignment.billing_cycle,
            payment_day: assignment.payment_day,
            status: assignment.status,
            class_schedules: schedule
              ? { target_class: (schedule as ClassSchedule).target_class }
              : null,
          });
          studentClassesByStudent.set(assignment.student_id, current);
        });
        ((currentPlanClasses || []) as any[]).forEach((plan) => {
          const schedule = classesById.get(plan.class_schedule_id) as ClassSchedule | undefined;
          if (!schedule) return;
          const current = currentPlanClassesByStudent.get(plan.student_id) || [];
          current.push(schedule as ActiveAppSchedule);
          currentPlanClassesByStudent.set(plan.student_id, current);
        });
      }

      // Clean attendance code helper (clean 4 digits or back number, NO APP-UUID!)
      const formatCleanAttendanceCode = (code: string | null | undefined, phone: string | null | undefined, backNum: string | null | undefined) => {
        if (code && !code.startsWith('APP-') && !code.startsWith('app-') && code.length <= 8) return code;
        if (backNum && backNum.trim()) return backNum.trim();
        const digits = (phone || '').replace(/[^0-9]/g, '');
        if (digits.length >= 4) return digits.slice(-4);
        return code && code.startsWith('APP-') ? code.slice(4, 8) : '-';
      };

      const existingChildIds = new Set<string>();

      // 1. Existing academy_students
      const activeStudents: any[] = rawAcademyStudents
        .filter((student: any) => (
          (!student.child_id || student.child?.deleted_at == null)
          && (!student.parent_user_id || student.parent_user?.status !== 'deleted')
        ))
        .map((student: any) => {
          if (student.child_id) existingChildIds.add(student.child_id);
          const cleanPhone = student.mother_phone || student.father_phone || student.student_phone || student.parent_user?.phone;
          return {
            ...student,
            attendance_code: formatCleanAttendanceCode(student.attendance_code, cleanPhone, student.child?.back_number),
            academy_student_classes: studentClassesByStudent.get(student.id) || [],
          };
        });

      // 2. Add all children registered from mobile app
      rawChildren.forEach((child: any) => {
        if (existingChildIds.has(child.id)) return;
        if (child.parent && child.parent.status === 'deleted') return;
        existingChildIds.add(child.id);

        const parentPhone = child.parent?.phone || '';
        activeStudents.push({
          id: `child-${child.id}`,
          student_name: child.child_name || '원생',
          attendance_code: formatCleanAttendanceCode(child.back_number, parentPhone, child.back_number),
          mother_phone: parentPhone || '',
          father_phone: '',
          student_phone: '',
          school_name: '',
          grade_level: '',
          admission_date: child.created_at?.slice(0, 10) || '',
          notes: '',
          parent_name: child.parent?.name || '',
          parent_user_id: child.parent_id || null,
          child_id: child.id,
          branch_id: child.branch_id || child.parent?.branch_id || activeBranchId || 'branch_1',
          created_at: child.created_at || new Date().toISOString(),
          parent_user: child.parent ? { name: child.parent.name, email: child.parent.email, status: child.parent.status } : null,
          child: { deleted_at: null },
          academy_student_classes: [],
        });
      });

      const usersWithStudents = new Set<string>();
      rawAcademyStudents.forEach((student: any) => {
        if (student.parent_user_id) usersWithStudents.add(student.parent_user_id);
      });
      rawChildren.forEach((child: any) => {
        if (child.parent_id) usersWithStudents.add(child.parent_id);
      });
      setUnregisteredMembers(rawUsers
        .filter((user: any) => user.role === 'user' && !usersWithStudents.has(user.id))
        .map((user: any) => ({
          id: user.id,
          name: user.name || '이름 미등록',
          username: user.username || null,
          email: user.email || null,
          phone: user.phone || null,
          branch_id: user.branch_id || null,
          created_at: user.created_at,
        }))
        .sort((left: UnregisteredMember, right: UnregisteredMember) => left.name.localeCompare(right.name, 'ko-KR')));

      const childIds = activeStudents.map((student: any) => student.child_id).filter(Boolean);
      
      const [schedulesByChild, pkgsResult] = await Promise.all([
        loadActiveAppSchedulesByChild(childIds),
        childIds.length > 0 
          ? supabase.from('user_packages').select('child_id, package_name, total_count, remaining_count, price, valid_until, expiry_date, status').in('child_id', childIds).eq('status', 'active').order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      const pkgsMap = new Map<string, any>();
      const today = new Date().toISOString().slice(0, 10);
      ((pkgsResult.data || []) as any[]).forEach((pkg: any) => {
        const expiresOn = pkg.valid_until || pkg.expiry_date || null;
        if (expiresOn && expiresOn < today) return;
        if (!pkgsMap.has(pkg.child_id)) {
          pkgsMap.set(pkg.child_id, pkg);
        }
      });

      setStudents(activeStudents.map((student: any) => ({
        ...student,
        app_schedule_classes: student.child_id
          ? currentPlanClassesByStudent.get(student.id) || schedulesByChild.get(student.child_id) || []
          : undefined,
        active_package: student.child_id ? pkgsMap.get(student.child_id) || null : null,
      })) as Student[]);
    } catch (err) {
      console.error('Error loading students page data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load withdrawn/departed records
  const loadWithdrawals = async () => {
    setWithdrawalLoading(true);
    try {
      let query = supabase.from('user_withdrawals').select('*').order('created_at', { ascending: false });
      if (activeBranchId && activeBranchId !== 'all') {
        query = query.eq('branch_id', activeBranchId);
      }
      let deletedUsersQuery = supabase
        .from('users')
        .select('id, name, phone, email, branch_id, created_at')
        .eq('status', 'deleted');
      let academyStudentsQuery = supabase
        .from('academy_students')
        .select('id, parent_user_id, child_id, branch_id, student_name, parent_name, attendance_code, mother_phone, father_phone, student_phone');

      if (activeBranchId && activeBranchId !== 'all') {
        deletedUsersQuery = deletedUsersQuery.eq('branch_id', activeBranchId);
        academyStudentsQuery = academyStudentsQuery.eq('branch_id', activeBranchId);
      }

      const [withdrawalResult, deletedUsersResult, academyStudentsResult] = await Promise.all([
        query,
        deletedUsersQuery,
        academyStudentsQuery,
      ]);

      if (withdrawalResult.error) throw withdrawalResult.error;
      if (deletedUsersResult.error) throw deletedUsersResult.error;
      if (academyStudentsResult.error) throw academyStudentsResult.error;

      const stored = (withdrawalResult.data || []) as WithdrawalRecord[];
      const students = (academyStudentsResult.data || []) as any[];
      const studentsByParent = new Map<string, any[]>();
      students.forEach((row) => {
        if (!row.parent_user_id) return;
        const rows = studentsByParent.get(row.parent_user_id) || [];
        rows.push(row);
        studentsByParent.set(row.parent_user_id, rows);
      });

      const storedChildIds = new Set(stored.map((row) => row.child_id).filter(Boolean));
      const storedAccountUserIds = new Set(
        stored.filter((row) => !row.child_id).map((row) => row.user_id).filter(Boolean),
      );
      const inferred: WithdrawalRecord[] = [];

      // 앱 회원탈퇴는 users 행을 익명화하고 status만 deleted로 남긴다.
      for (const user of deletedUsersResult.data || []) {
        if (storedAccountUserIds.has(user.id)) continue;
        const linkedStudents = studentsByParent.get(user.id) || [];
        const emailTimestamp = typeof user.email === 'string'
          ? user.email.match(/^deleted_(\d+)@unknown\.com$/)?.[1]
          : undefined;
        const deletedAt = emailTimestamp
          ? new Date(Number(emailTimestamp)).toISOString()
          : user.created_at;

        const visibleStudents = linkedStudents.filter((student) => !storedChildIds.has(student.child_id));
        if (visibleStudents.length > 0) {
          visibleStudents.forEach((student) => {
            inferred.push({
              id: `deleted-user:${user.id}:${student.child_id || student.id}`,
              user_id: user.id,
              user_name: student.parent_name || '탈퇴한 사용자',
              phone: student.mother_phone || student.father_phone || student.student_phone || null,
              child_id: student.child_id || null,
              child_name: student.student_name || '원생 미지정',
              attendance_code: student.attendance_code || null,
              branch_id: student.branch_id || user.branch_id || null,
              reason: '앱 회원 탈퇴',
              source: 'app',
              event_type: 'account_withdrawal',
              refund_status: 'none',
              created_at: deletedAt,
              is_inferred: true,
            });
            if (student.child_id) storedChildIds.add(student.child_id);
          });
        } else {
          inferred.push({
            id: `deleted-user:${user.id}`,
            user_id: user.id,
            user_name: '탈퇴한 사용자',
            phone: null,
            child_id: null,
            child_name: null,
            attendance_code: null,
            branch_id: user.branch_id || null,
            reason: '앱 회원 탈퇴',
            source: 'app',
            event_type: 'account_withdrawal',
            refund_status: 'none',
            created_at: deletedAt,
            is_inferred: true,
          });
        }
        storedAccountUserIds.add(user.id);
      }

      setWithdrawals([...stored, ...inferred].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ));
    } catch (err) {
      console.warn('Error loading withdrawals:', err);
    } finally {
      setWithdrawalLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadWithdrawals();
  }, [activeBranchId]);

  // Open refund process modal
  const openRefundModal = (item: WithdrawalRecord) => {
    setSelectedWithdrawal(item);
    setRefundStatus(item.refund_status || 'pending');
    setRefundAmount(item.refund_amount || 0);
    setRefundMemo(item.refund_memo || '');
    setRefundModalOpen(true);
  };

  // Save refund processing
  const handleSaveRefund = async () => {
    if (!selectedWithdrawal) return;
    setRefundSaving(true);
    try {
      const payload: any = {
        refund_status: refundStatus,
        refund_amount: Number(refundAmount) || 0,
        refund_memo: refundMemo.trim(),
      };
      if (refundStatus === 'completed') {
        payload.refunded_at = new Date().toISOString();
      } else if (refundStatus === 'none' || refundStatus === 'pending') {
        payload.refunded_at = null;
      }
      const { error } = await supabase.from('user_withdrawals').update(payload).eq('id', selectedWithdrawal.id);
      if (error) throw error;
      alert('환불 정산 정보가 안전하게 저장되었습니다.');
      setRefundModalOpen(false);
      loadWithdrawals();
    } catch (err: any) {
      alert(`환불 처리 저장 실패: ${err.message || err}`);
    } finally {
      setRefundSaving(false);
    }
  };

  // Offline departure handler
  const handleDepartStudent = async (student: Student) => {
    const reason = prompt(
      `[${student.student_name}] 원생의 퇴원(이탈) 사유를 선택하거나 입력해주세요:\n\n1. 이사 / 지역 이동\n2. 수강 종료 / 일정 종료\n3. 타 학원 이동\n4. 개인 사정\n\n직접 사유를 입력하셔도 됩니다.`,
      '수강 종료 / 일정 종료'
    );
    if (reason === null) return;

    if (!confirm(`[${student.student_name}] 원생을 '퇴원·탈퇴 회원'으로 이동 처리하시겠습니까?\n출결 및 이용권은 종료 상태로 아카이빙됩니다.`)) {
      return;
    }

    try {
      setSaveLoading(true);
      let pkgInfo: any = null;
      let actualAttendedCount = 0;
      const targetChildId = student.child_id || student.id;

      if (student.child_id) {
        const { data: pkgs } = await supabase.from('user_packages').select('*').eq('child_id', student.child_id).limit(1);
        if (pkgs && pkgs.length > 0) pkgInfo = pkgs[0];
      }

      // 🎯 수업 예약이 아닌 실제 "등원(출석)" 로그를 카운팅하여 실제 사용 횟수 산출
      if (targetChildId) {
        const { count } = await supabase
          .from('attendance_logs')
          .select('id', { count: 'exact', head: true })
          .eq('child_id', targetChildId)
          .not('check_in', 'is', null);
        actualAttendedCount = count || 0;
      }

      const totalCount = pkgInfo?.total_count || 0;
      const usedCount = Math.min(totalCount, actualAttendedCount);
      const remainingCount = Math.max(0, totalCount - usedCount);
      
      await supabase.from('user_withdrawals').insert([{
        user_id: student.parent_user_id || null,
        user_name: student.parent_user?.name || student.parent_name || null,
        phone: student.mother_phone || student.father_phone || student.student_phone || null,
        child_id: student.child_id || null,
        child_name: student.student_name,
        attendance_code: student.attendance_code,
        branch_id: student.branch_id,
        reason: reason || '수강 종료 / 일정 종료',
        source: 'admin',
        event_type: 'academy_withdrawal',
        package_name: pkgInfo?.package_name || null,
        paid_amount: pkgInfo?.price || 0,
        total_count: totalCount,
        used_count: usedCount,
        remaining_count: remainingCount,
        refund_status: remainingCount > 0 ? 'pending' : 'none',
      }]);

      if (student.child_id) {
        await supabase.from('children').update({ deleted_at: new Date().toISOString() }).eq('id', student.child_id);
      } else {
        await supabase.from('academy_students').delete().eq('id', student.id);
      }

      alert(`[${student.student_name}] 원생의 퇴원 처리가 완료되었습니다.\n상단의 [퇴원·탈퇴 회원] 탭에서 내역을 확인하실 수 있습니다.`);
      setIsModalOpen(false);
      loadData();
      loadWithdrawals();
    } catch (err: any) {
      alert(`퇴원 처리 중 오류: ${err.message || err}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // Open modal for registration/edit
  const openModal = async (student?: Student) => {
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
        const [
          { data: owned },
          { data: plans },
          { data: currentBills },
          { data: currentPlans },
          { data: previousPlans },
          { data: previousBills },
        ] = await Promise.all([
          supabase
            .from('user_packages')
            .select('option_id, package_name, status, remaining_count, valid_until, expiry_date')
            .eq('child_id', student.child_id)
            .eq('status', 'active'),
          supabase
            .from('academy_student_monthly_plans')
            .select('item_type, class_schedule_id, package_option_id, billing_cycle, payment_day')
            .eq('student_id', student.id)
            .eq('effective_month', nextMonthStart())
            .eq('status', 'planned'),
          supabase
            .from('academy_bills')
            .select('id, package_option_id, amount_paid, status, payment_request_id')
            .eq('student_id', student.id)
            .eq('bill_month', currentBillMonth()),
          supabase
            .from('academy_student_monthly_plans')
            .select('item_type, class_schedule_id, package_option_id, billing_cycle, payment_day')
            .eq('student_id', student.id)
            .eq('effective_month', `${currentBillMonth()}-01`)
            .in('status', ['planned', 'applied']),
          supabase
            .from('academy_student_monthly_plans')
            .select('package_option_id')
            .eq('student_id', student.id)
            .eq('effective_month', `${billMonthByOffset(-1)}-01`)
            .eq('item_type', 'package')
            .in('status', ['planned', 'applied']),
          supabase
            .from('academy_bills')
            .select('package_option_id')
            .eq('student_id', student.id)
            .eq('bill_month', billMonthByOffset(-1)),
        ]);
        const today = new Date().toISOString().slice(0, 10);
        const ownedRows = ((owned || []) as Array<{
          option_id: string | null;
          package_name: string | null;
          remaining_count: number | null;
          valid_until: string | null;
          expiry_date: string | null;
        }>).filter((row) => {
          const expiresOn = row.valid_until || row.expiry_date || null;
          if (expiresOn && expiresOn < today) return false;
          return true;
        });
        setCurrentPackageLabels(Array.from(new Set(ownedRows.map((row) => row.package_name).filter(Boolean) as string[])));
        const currentBillRows = (currentBills || []) as Array<{
          package_option_id: string | null;
          amount_paid: number | null;
          status: string | null;
        }>;
        const currentPlanRows = (currentPlans || []) as any[];
        const currentPlanPackageIds = currentPlanRows
          .filter((plan) => plan.item_type === 'package')
          .map((plan) => plan.package_option_id)
          .filter(Boolean) as string[];
        const currentBillPackageIds = currentBillRows
          .map((bill) => bill.package_option_id)
          .filter(Boolean) as string[];
        const previousPlanPackageIds = (previousPlans || [])
          .map((plan: any) => plan.package_option_id)
          .filter(Boolean) as string[];
        const previousBillPackageIds = (previousBills || [])
          .map((bill: any) => bill.package_option_id)
          .filter(Boolean) as string[];
        const currentPackageOptionIds = currentPlanPackageIds.length > 0
          ? currentPlanPackageIds
          : currentBillPackageIds.length > 0
            ? currentBillPackageIds
            : previousPlanPackageIds.length > 0
              ? previousPlanPackageIds
              : previousBillPackageIds;
        const fallbackOwnedOptionIds = ownedRows.map((row) => row.option_id).filter(Boolean) as string[];
        setCurrentMonthPackageSource(
          currentPlanPackageIds.length > 0 ? 'current_plan'
            : currentBillPackageIds.length > 0 ? 'current_bill'
              : previousPlanPackageIds.length > 0 ? 'previous_plan'
                : previousBillPackageIds.length > 0 ? 'previous_bill'
                  : fallbackOwnedOptionIds.length > 0 ? 'active_owned'
                    : 'none',
        );
        setCurrentMonthPackages(Array.from(new Set(currentPackageOptionIds.length > 0 ? currentPackageOptionIds : fallbackOwnedOptionIds))
          .map((optionId) => ({
            ...emptyAssignment(),
            package_option_id: optionId,
          })));
        const plannedCurrentClassIds = currentPlanRows
          .filter((plan) => plan.item_type === 'class')
          .map((plan) => plan.class_schedule_id)
          .filter(Boolean);
        setCurrentMonthClassIds(plannedCurrentClassIds.length > 0
          ? plannedCurrentClassIds
          : (student.app_schedule_classes || []).map((schedule) => schedule.id));
        const firstOptionId = ownedRows.find((row) => row.option_id)?.option_id || '';
        const planRows = (plans || []) as any[];
        setNextMonthClassIds(planRows.length > 0
          ? planRows.filter((plan) => plan.item_type === 'class').map((plan) => plan.class_schedule_id).filter(Boolean)
          : (student.app_schedule_classes || []).map((schedule) => schedule.id));
        setNextMonthPackages(planRows.length > 0
          ? planRows.filter((plan) => plan.item_type === 'package').map((plan: any) => ({
              class_schedule_id: '',
              package_option_id: plan.package_option_id || '',
              billing_cycle: plan.billing_cycle || '월 기간제',
              payment_day: plan.payment_day || '매월 1일',
            }))
          : (firstOptionId ? [{
              ...emptyAssignment(),
              package_option_id: firstOptionId,
            }] : []));
      } else {
        setCurrentPackageLabels([]);
        setCurrentMonthPackages([]);
        setCurrentMonthPackageSource('none');
        setCurrentMonthClassIds([]);
        setNextMonthClassIds([]);
        setNextMonthPackages([]);
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
      setCurrentPackageLabels([]);
      setCurrentMonthPackages([]);
      setCurrentMonthPackageSource('none');
      setCurrentMonthClassIds([]);
      setNextMonthClassIds([]);
      setNextMonthPackages([]);
      setClassAssignments([emptyAssignment()]);
    }
    setIsModalOpen(true);
  };

  // Helper to search and link parent user in real-time
  const linkParentAccount = async (mother: string, father: string): Promise<string | null> => {
    const cleanMother = mother.replace(/[^0-9]/g, '');
    const cleanFather = father.replace(/[^0-9]/g, '');

    if (!cleanMother && !cleanFather) return null;

    const phones = [cleanMother, cleanFather].filter(Boolean);
    const { data } = await supabase
      .from('users')
      .select('id, phone')
      .in('phone', phones)
      .neq('status', 'deleted')
      .limit(1);

    return data && data.length > 0 ? data[0].id : null;
  };

  const handleSaveCurrentMonthBill = async () => {
    if (!editingId) return;
    if (currentMonthPackages.some((assignment) => !assignment.package_option_id)) {
      alert('추가한 청구 항목의 이용권을 모두 선택해 주세요.');
      return;
    }

    const optionIds = currentMonthPackages.map((assignment) => assignment.package_option_id);
    if (new Set(optionIds).size !== optionIds.length) {
      alert('동일한 이용권을 중복으로 청구할 수 없습니다.');
      return;
    }

    const selectedOptions = packageOptions.filter((option) => optionIds.includes(option.id));
    const totalAmount = selectedOptions.reduce((sum, option) => sum + option.price, 0);
    const description = selectedOptions.length > 0
      ? selectedOptions.map((option) => `${option.packages?.name || '이용권'} (${option.label})`).join(', ')
      : '청구 없음';
    if (!confirm(`${studentName} 원생의 ${monthLabel(0)} 수업·청구 예정 구성을 저장할까요?\n${description}\n예상 청구액 ${totalAmount.toLocaleString()}원\n저장 후 수납 관리의 청구대상 관리에 반영됩니다.`)) return;

    setCurrentMonthBillSaving(true);
    try {
      const currentMonthStart = `${currentBillMonth()}-01`;
      const { error: deletePlanError } = await supabase
        .from('academy_student_monthly_plans')
        .delete()
        .eq('student_id', editingId)
        .eq('effective_month', currentMonthStart)
        .in('status', ['planned', 'applied']);
      if (deletePlanError) throw deletePlanError;

      const currentPlanRows = [
        ...currentMonthClassIds.map((classScheduleId) => ({
          student_id: editingId,
          branch_id: selectedBranchId,
          effective_month: currentMonthStart,
          item_type: 'class',
          class_schedule_id: classScheduleId,
          package_option_id: null,
          billing_cycle: '월 기간제',
          payment_day: '매월 1일',
          status: 'planned',
        })),
        ...optionIds.map((packageOptionId) => ({
          student_id: editingId,
          branch_id: selectedBranchId,
          effective_month: currentMonthStart,
          item_type: 'package',
          class_schedule_id: null,
          package_option_id: packageOptionId,
          billing_cycle: '월 기간제',
          payment_day: '매월 1일',
          status: 'planned',
        })),
      ];
      if (currentPlanRows.length > 0) {
        const { error: insertPlanError } = await supabase
          .from('academy_student_monthly_plans')
          .insert(currentPlanRows);
        if (insertPlanError) throw insertPlanError;
      }

      alert(optionIds.length > 0
        ? '이번 달 수업·관리용 이용권을 청구 예정 대상으로 저장했습니다. 수납 관리의 청구대상 관리에서 확인할 수 있습니다.'
        : '이번 달 수업 설정을 저장하고 청구 예정 이용권을 모두 제거했습니다.');
    } catch (error: any) {
      alert(`이번 달 청구 처리 실패: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      setCurrentMonthBillSaving(false);
    }
  };

  // Save or Update Student
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return alert('학생 이름을 입력해주세요.');
    if (!attendanceCode.trim()) return alert('출결번호를 입력해주세요.');
    if (!selectedBranchId) return alert('지점을 선택해주세요.');
    const editingStudent = editingId ? students.find((student) => student.id === editingId) : null;
    const isAppLinked = Boolean(editingStudent?.child_id);
    const assignmentsToValidate = isAppLinked ? nextMonthPackages : classAssignments;
    if (!isAppLinked && assignmentsToValidate.length === 0) return alert('수업 또는 이용권을 한 개 이상 추가해 주세요.');
    if (assignmentsToValidate.some((assignment) => !assignment.package_option_id)) return alert('모든 수강 항목에 이용권 요금제를 지정해 주세요.');
    const assignmentKeys = assignmentsToValidate.map((assignment) => `${assignment.class_schedule_id || 'package-only'}:${assignment.package_option_id}`);
    if (new Set(assignmentKeys).size !== assignmentKeys.length) return alert('동일한 수업반과 이용권 조합이 중복되어 있습니다.');

    setSaveLoading(true);
    try {
      const parentId = await linkParentAccount(motherPhone, fatherPhone);

      const studentPayload = {
        branch_id: selectedBranchId,
        student_name: studentName.trim(),
        parent_name: parentName.trim() || null,
        attendance_code: attendanceCode.trim(),
        mother_phone: motherPhone.trim() || null,
        father_phone: fatherPhone.trim() || null,
        student_phone: studentPhone.trim() || null,
        birth_date: birthDate || null,
        school_name: schoolName.trim() || null,
        grade_level: gradeLevel.trim() || null,
        address: address.trim() || null,
        admission_date: admissionDate || null,
        memo: memo.trim() || null,
        is_sms_enabled: isSmsEnabled,
        parent_user_id: parentId || (editingId ? students.find((student) => student.id === editingId)?.parent_user_id : null)
      };

      let studentId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from('academy_students')
          .update(studentPayload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('academy_students')
          .insert([studentPayload])
          .select('id')
          .single();
        if (error) throw error;
        studentId = data.id;
      }

      // Web-only students keep using academy_student_classes. App-linked
      // students save only next month's plan; current app data is read-only.
      if (studentId && !isAppLinked) {
        if (editingId) {
          const { error: deleteError } = await supabase
            .from('academy_student_classes')
            .delete()
            .eq('student_id', studentId);
          if (deleteError) throw deleteError;
        }

        const { error: assignmentError } = await supabase
          .from('academy_student_classes')
          .insert(classAssignments.map((assignment) => ({
            student_id: studentId,
            class_schedule_id: assignment.class_schedule_id || null,
            package_option_id: assignment.package_option_id,
            billing_cycle: assignment.billing_cycle,
            payment_day: assignment.payment_day,
            status: 'active'
          })));
        if (assignmentError) throw assignmentError;
      }

      if (studentId && isAppLinked) {
        // Class plans are synchronized through a transactional RPC that also
        // creates the future-dated app assignments and target-month bookings.
        const { error: futureScheduleError } = await supabase.rpc(
          'sync_future_month_student_schedules',
          {
            p_student_id: studentId,
            p_effective_month: nextMonthStart(),
            p_schedule_ids: nextMonthClassIds,
          },
        );
        if (futureScheduleError) throw futureScheduleError;

        // Billable packages are independent from class assignments and can be
        // added/removed without changing the future timetable.
        const { error: deletePlanError } = await supabase
          .from('academy_student_monthly_plans')
          .delete()
          .eq('student_id', studentId)
          .eq('effective_month', nextMonthStart())
          .eq('item_type', 'package');
        if (deletePlanError) throw deletePlanError;

        const nextPlanRows = nextMonthPackages.map((assignment) => ({
            student_id: studentId,
            branch_id: selectedBranchId,
            effective_month: nextMonthStart(),
            item_type: 'package',
            class_schedule_id: null,
            package_option_id: assignment.package_option_id,
            billing_cycle: assignment.billing_cycle,
            payment_day: assignment.payment_day,
            status: 'planned',
          }));
        const { error: planError } = nextPlanRows.length > 0
          ? await supabase.from('academy_student_monthly_plans').insert(nextPlanRows)
          : { error: null };
        if (planError) throw planError;
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(`저장에 실패했습니다: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // Delete Student (모달 오픈)
  const openDeleteModal = (student: Student) => {
    setTargetStudentForDelete({
      id: student.id,
      name: student.student_name,
      child_id: student.child_id
    });
    setConfirmInputName('');
    setDeleteModalOpen(true);
  };

  // Delete Confirm Action (실제 삭제 실행)
  const handleConfirmDelete = async () => {
    if (!targetStudentForDelete) return;
    if (confirmInputName.trim() !== targetStudentForDelete.name.trim()) {
      alert('입력하신 학생 이름이 일치하지 않습니다.');
      return;
    }

    setDeleteLoading(true);
    try {
      const rawId = targetStudentForDelete.id;

      // 1. 앱 가입 자녀 (id가 'child-' 로 시작하는 가상 ID인 경우)
      if (rawId.startsWith('child-')) {
        const realChildId = rawId.replace('child-', '');

        // 잔여 이용권 상태를 'expired' 처리
        await supabase
          .from('user_packages')
          .update({ status: 'expired' })
          .eq('child_id', realChildId)
          .eq('status', 'active');

        // 미래 예약 소프트 삭제/취소 처리
        await supabase
          .from('reservations')
          .update({ status: 'canceled', deleted_at: new Date().toISOString() })
          .eq('child_id', realChildId)
          .is('deleted_at', null);

        // children 테이블 소프트 삭제
        const { error } = await supabase
          .from('children')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', realChildId);

        if (error) throw error;
      } else {
        // 2. 학원 등록 원생 (academy_students 테이블)
        // 연관된 child_id가 있으면 함께 소프트 삭제 및 이용권 정리 처리
        if (targetStudentForDelete.child_id) {
          await supabase
            .from('children')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', targetStudentForDelete.child_id);

          await supabase
            .from('user_packages')
            .update({ status: 'expired' })
            .eq('child_id', targetStudentForDelete.child_id)
            .eq('status', 'active');
        }

        const { error } = await supabase
          .from('academy_students')
          .delete()
          .eq('id', rawId);

        if (error) throw error;
      }

      alert(`'${targetStudentForDelete.name}' 원생이 정상적으로 삭제 처리되었습니다.`);
      setDeleteModalOpen(false);
      setTargetStudentForDelete(null);
      loadData();
    } catch (err: any) {
      alert(`삭제 처리에 실패했습니다: ${err.message || err}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Download Excel Registration template
  const downloadTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('원생 등록 양식');

      worksheet.getRow(1).values = [
        '클래스명 (선택 - 예: 초등축구반)',
        '이름 (필수)',
        '보호자 이름 (선택)',
        '출결번호 (필수)',
        '어머니 연락처',
        '아버지 연락처',
        '학생 연락처',
        '생년월일 (예: 2016-05-12)',
        '학교명',
        '학년',
        '입회일 (예: 2026-08-01)',
        '수강 요금제명 (필수 - 예: 주 2회 패키지)',
        '납부 주기 (선택 - 월 기간제/분기제 등)',
        '매월 수납일 (선택 - 매월 1일/매월 5일 등)',
        '비공개 메모'
      ];

      worksheet.columns.forEach(column => {
        column.width = 25;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = '아이패스케어_원생일괄등록_양식.xlsx';
      link.click();
    } catch (err) {
      alert('템플릿 생성 중 에러가 발생했습니다.');
    }
  };

  // Excel File Batch Import Handler
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const currentBranch = activeBranchId && activeBranchId !== 'all' ? activeBranchId : (branches.length > 0 ? branches[0].id : '');
    if (!currentBranch) {
      alert('지점을 먼저 특정해주세요. (상단 지점 필터에서 특정 지점을 선택해야 엑셀 일괄 등록이 가능합니다.)');
      e.target.value = '';
      return;
    }

    if (!confirm(`선택한 엑셀 파일로 학생 정보를 일괄 업로드하시겠습니까?\n선택된 소속 지점: ${branches.find(b => b.id === currentBranch)?.name}`)) {
      e.target.value = '';
      return;
    }

    setExcelLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result as ArrayBuffer;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);
          const worksheet = workbook.worksheets[0];

          const importedStudents: any[] = [];
          const mappingRequests: Array<{
            studentIndex: number;
            className: string;
            packageName: string;
            cycle: string;
            day: string;
          }> = [];

          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            const className = row.getCell(1).text?.trim();
            const name = row.getCell(2).text?.trim();
            const parentNameText = row.getCell(3).text?.trim();
            const code = row.getCell(4).text?.trim();
            const motherPhoneVal = row.getCell(5).text?.trim().replace(/[^0-9]/g, '');
            const fatherPhoneVal = row.getCell(6).text?.trim().replace(/[^0-9]/g, '');
            const studentPhoneVal = row.getCell(7).text?.trim().replace(/[^0-9]/g, '');
            const rawBirth = row.getCell(8).text?.trim();
            const school = row.getCell(9).text?.trim();
            const grade = row.getCell(10).text?.trim();
            const rawAdmission = row.getCell(11).text?.trim();
            const packageNameText = row.getCell(12).text?.trim(); // 요금제명
            const cycleText = row.getCell(13).text?.trim();       // 납부 주기
            const dayText = row.getCell(14).text?.trim();         // 수납일
            const memoText = row.getCell(15).text?.trim();

            if (!name || !code) return;

            let birthStr = null;
            if (rawBirth) {
              const cleanBirth = rawBirth.replace(/[^0-9]/g, '');
              if (cleanBirth.length === 8) {
                birthStr = `${cleanBirth.slice(0, 4)}-${cleanBirth.slice(4, 6)}-${cleanBirth.slice(6, 8)}`;
              } else if (rawBirth.includes('-')) {
                birthStr = rawBirth;
              }
            }

            let admissionStr = new Date().toISOString().slice(0, 10);
            if (rawAdmission) {
              const cleanAdm = rawAdmission.replace(/[^0-9]/g, '');
              if (cleanAdm.length === 8) {
                admissionStr = `${cleanAdm.slice(0, 4)}-${cleanAdm.slice(4, 6)}-${cleanAdm.slice(6, 8)}`;
              } else if (rawAdmission.includes('-')) {
                admissionStr = rawAdmission;
              }
            }

            importedStudents.push({
              branch_id: currentBranch,
              student_name: name,
              parent_name: parentNameText || null,
              attendance_code: code,
              mother_phone: motherPhoneVal || null,
              father_phone: fatherPhoneVal || null,
              student_phone: studentPhoneVal || null,
              birth_date: birthStr,
              school_name: school || null,
              grade_level: grade || null,
              address: null,
              admission_date: admissionStr,
              memo: memoText || null,
              is_sms_enabled: true
            });

            mappingRequests.push({
              studentIndex: importedStudents.length - 1,
              className: className || '',
              packageName: packageNameText || '',
              cycle: cycleText || '월 기간제',
              day: dayText || '매월 1일'
            });
          });

          if (importedStudents.length === 0) {
            alert('엑셀 시트에서 등록 가능한 학생 데이터를 발견하지 못했습니다.');
            setExcelLoading(false);
            return;
          }

          let insertedCount = 0;
          for (let i = 0; i < importedStudents.length; i++) {
            const student = importedStudents[i];
            const parentId = await linkParentAccount(student.mother_phone || '', student.father_phone || '');
            student.parent_user_id = parentId;

            const { data: sData, error: sErr } = await supabase
              .from('academy_students')
              .insert([student])
              .select('id')
              .single();

            if (!sErr && sData) {
              insertedCount++;

              const req = mappingRequests[i];
              const matchedClass = req.className 
                ? classes.find(c => c.target_class.trim() === req.className) 
                : null;
              
              let matchedOpt = req.packageName 
                ? packageOptions.find(p => p.label.trim() === req.packageName) 
                : null;
              
              if (!matchedOpt) {
                matchedOpt = packageOptions.find(p => p.branch_id === currentBranch) || null;
              }

              if (matchedOpt) {
                await supabase
                  .from('academy_student_classes')
                  .insert([{
                    student_id: sData.id,
                    class_schedule_id: matchedClass ? matchedClass.id : null,
                    package_option_id: matchedOpt.id,
                    billing_cycle: req.cycle,
                    payment_day: req.day,
                    status: 'active'
                  }]);
              }
            }
          }

          alert(`성공적으로 ${insertedCount}명의 학생 정보를 일괄 등록 완료했습니다!`);
          loadData();
        } catch (err: any) {
          alert(`엑셀 파일 처리 중 에러가 발생했습니다: ${err.message}`);
        } finally {
          setExcelLoading(false);
          e.target.value = '';
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      alert(`파일 업로드 실패: ${err.message}`);
      setExcelLoading(false);
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
  const sortedModalClasses = [...classes].sort((left, right) => {
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
    current_plan: { tone: 'border-blue-200 bg-blue-50 text-blue-700', text: '이번 달에 저장해 둔 청구 예정 이용권을 불러왔습니다. 변경 후 다시 저장할 수 있습니다.' },
    current_bill: { tone: 'border-indigo-200 bg-indigo-50 text-indigo-700', text: '이번 달에 이미 생성된 청구내역을 기준으로 불러왔습니다. 저장하면 새 청구서가 아니라 청구대상 관리의 예정 구성으로 반영됩니다.' },
    previous_plan: { tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', text: '지난달에 설정한 관리용 이용권을 이번 달 기본값으로 가져왔습니다. 내용이 맞는지 확인한 후 저장해 주세요.' },
    previous_bill: { tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', text: '지난달에 청구했던 이용권을 이번 달 기본값으로 가져왔습니다. 이용권이 달라졌다면 추가·삭제 후 저장해 주세요.' },
    active_owned: { tone: 'border-amber-200 bg-amber-50 text-amber-700', text: '지난달 이용권 기록이 없어 현재 활성 지급 이용권을 참고해 기본값을 구성했습니다. 청구 대상이 맞는지 확인해 주세요.' },
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
            onClick={loadWithdrawals}
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
                              title="원생 삭제"
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
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-6" onClick={() => setIsModalOpen(false)}>
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
                    <div><div className="text-xs font-black text-slate-800">이번 달 수업·청구 이용권</div><div className="mt-0.5 text-[10px] font-medium text-slate-500">수업과 보유 이용권은 그대로 유지하고, 이번 달에 청구할 이용권만 편집합니다.</div></div>
                    <div className="space-y-3 rounded-2xl border border-blue-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div><div className="text-[11px] font-black text-blue-700">이번 달 수업 선택</div><div className="text-[10px] font-medium text-slate-500">선택 {currentMonthClassIds.length}개</div></div>
                        {currentMonthClassIds.length > 0 && <button type="button" disabled={currentMonthBillSaving} onClick={() => setCurrentMonthClassIds([])} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 disabled:opacity-50">전체 해제</button>}
                      </div>

                      {currentMonthClassIds.length > 0 && (
                        <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-blue-50 p-2">
                          {currentMonthClassIds.map((id) => {
                            const selected = classes.find((item) => item.id === id);
                            return selected ? <button key={id} type="button" disabled={currentMonthBillSaving} onClick={() => setCurrentMonthClassIds((current) => current.filter((itemId) => itemId !== id))} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-blue-700 shadow-xs disabled:opacity-50">{normalizedWeekday(selected.day_of_week)} {selected.start_time?.slice(0, 5)} · {selected.target_class} ×</button> : null;
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
                            <input type="checkbox" checked={checked} disabled={currentMonthBillSaving} onChange={(event) => setCurrentMonthClassIds((current) => event.target.checked ? Array.from(new Set([...current, schedule.id])) : current.filter((id) => id !== schedule.id))} className="h-4 w-4 shrink-0 accent-blue-600"/>
                            <span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{schedule.target_class}</span><span className="mt-0.5 block text-[10px] font-bold text-slate-500">{normalizedWeekday(schedule.day_of_week)}요일 · {schedule.start_time?.slice(0, 5) || '--:--'}~{schedule.end_time?.slice(0, 5) || '--:--'}</span></span>
                          </label>;
                        })}
                        {visibleCurrentMonthClasses.length === 0 && <div className="col-span-full rounded-xl bg-slate-50 py-6 text-center text-xs font-bold text-slate-400">해당 요일의 수업이 없습니다.</div>}
                      </div>
                    </div>
                    <div><div className="mb-1.5 text-[11px] font-black text-slate-500">실제 지급 이용권(참고)</div><div className="flex flex-wrap gap-1.5">{currentPackageLabels.length > 0 ? currentPackageLabels.map((label) => <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{label}</span>) : <span className="text-xs font-bold text-slate-400">지급된 이용권 없음</span>}</div><div className="mt-1 text-[10px] font-bold text-rose-500">아래 관리용 이용권을 수정해도 실제 지급 이용권은 생성·변경되지 않습니다.</div></div>
                    <div className="border-t border-slate-100 pt-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div><div className="text-[11px] font-black text-emerald-700">현재 관리용 이용권 · 이번 달 청구 예정</div><div className="text-[10px] text-slate-500">이번 달 저장값이 없으면 지난달 구성을 기본으로 불러옵니다. 저장 시 청구대상 관리에 반영됩니다.</div></div>
                        <button type="button" disabled={currentMonthBillSaving} onClick={() => setCurrentMonthPackages((current) => [...current, emptyAssignment()])} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Plus size={12}/> 이용권 추가</button>
                      </div>
                      <div className={`mb-3 rounded-xl border px-3 py-2.5 text-[10px] font-bold leading-5 ${currentMonthPackageGuide.tone}`}>
                        <span className="mr-1">안내:</span>{currentMonthPackageGuide.text}
                      </div>
                      <div className="space-y-2">
                        {currentMonthPackages.map((assignment, index) => {
                          const selected = packageOptions.find((option) => option.id === assignment.package_option_id);
                          return <div key={index} className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-2">
                            <select value={assignment.package_option_id} disabled={currentMonthBillSaving} onChange={(event) => setCurrentMonthPackages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, package_option_id: event.target.value } : item))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none disabled:bg-slate-100">
                              <option value="">이용권을 선택해 주세요</option>
                              {packageOptions.map((option) => <option key={option.id} value={option.id}>[{voucherTypeLabel(option.packages?.voucher_type)}] {option.packages?.name || '패키지'} · {option.label} ({option.price.toLocaleString()}원)</option>)}
                            </select>
                            {selected && <span className="hidden shrink-0 text-[10px] font-black text-emerald-700 sm:block">{selected.price.toLocaleString()}원</span>}
                            <button type="button" disabled={currentMonthBillSaving} aria-label="이번 달 청구 이용권 삭제" onClick={() => setCurrentMonthPackages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 disabled:text-slate-300"><Trash2 size={14}/></button>
                          </div>;
                        })}
                        {currentMonthPackages.length === 0 && <div className="rounded-xl bg-slate-50 py-4 text-center text-[11px] font-bold text-slate-400">이번 달 청구 이용권이 없습니다.</div>}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                        <span className="text-xs font-black text-slate-600">총 청구액 {packageOptions.filter((option) => currentMonthPackages.some((item) => item.package_option_id === option.id)).reduce((sum, option) => sum + option.price, 0).toLocaleString()}원</span>
                        <button type="button" onClick={() => void handleSaveCurrentMonthBill()} disabled={currentMonthBillSaving} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-[11px] font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300">{currentMonthBillSaving ? <Loader2 size={13} className="animate-spin"/> : <CheckCircle size={13}/>} 청구 예정 저장</button>
                      </div>
                    </div>
                  </div>
                ) : (
                <>
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-xs font-black text-slate-800">{isModalAppLinked ? `${monthLabel(1)} 수업 및 이용권` : '수강 수업반 및 요금제'}</div><div className="mt-0.5 text-[10px] font-medium text-slate-500">{isModalAppLinked ? '다음 달 청구서에는 여기서 저장한 이용권과 수업이 반영됩니다.' : '학생이 수강하는 수업을 여러 개 등록할 수 있습니다.'}</div></div>
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
                {isModalAppLinked && <div className="flex items-center justify-between"><div><div className="text-[11px] font-black text-emerald-700">다음 달 청구 이용권</div><div className="text-[10px] text-slate-500">차량·단품을 포함해 여러 개 추가할 수 있습니다.</div></div><button type="button" onClick={() => setNextMonthPackages((current) => [...current, emptyAssignment()])} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black text-white"><Plus size={12}/> 이용권 추가</button></div>}
                {(isModalAppLinked ? nextMonthPackages : classAssignments).map((assignment, index) => {
                  const selectablePackageOptions = isModalAppLinked
                    ? packageOptions
                    : packageOptions.filter((option) => (option.packages?.voucher_type || 'lesson') === 'lesson');
                  const selectedPackageOption = selectablePackageOptions.find((option) => option.id === assignment.package_option_id);
                  const updateAssignment = (values: Partial<ClassAssignment>) => isModalAppLinked
                    ? setNextMonthPackages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item))
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
                        {(isModalAppLinked || itemCount > 1) && <button type="button" aria-label="이용권 삭제" onClick={() => isModalAppLinked ? setNextMonthPackages((current) => current.filter((_, itemIndex) => itemIndex !== index)) : setClassAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>}
                      </div>
                      <div className={`grid grid-cols-1 gap-3 ${isModalAppLinked ? '' : 'sm:grid-cols-2'}`}>
                        {!isModalAppLinked && <div><label className="mb-1.5 block text-xs font-bold text-slate-500">수강 반 배정 (선택)</label><select value={assignment.class_schedule_id} onChange={(e) => updateAssignment({ class_schedule_id: e.target.value })} className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"><option value="">수업반 없음 / 이용권 단독 수강</option>{classes.map((item) => <option key={item.id} value={item.id}>{scheduleLabel(item)}</option>)}</select></div>}
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
                  disabled={saveLoading}
                  className={`flex ${editingId ? 'w-2/3' : 'w-full'} items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:bg-blue-300 shadow-sm`}
                >
                  {saveLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {editingId ? '학생 정보 수정 완료하기' : '학생 정보 등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ⚠️ 원생 삭제 이중 확인 모달 */}
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
                  <h3 className="font-extrabold text-base text-rose-950">원생 정보 삭제</h3>
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
                  <span className="text-slate-500 font-medium">삭제 대상 원생:</span>
                  <span className="font-bold text-slate-900">{targetStudentForDelete.name}</span>
                </div>
                <div className="text-xs text-rose-600 pt-1.5 border-t border-slate-200/60 font-medium leading-relaxed">
                  ⚠️ 삭제 시 해당 원생의 남은 이용권 및 예약도 함께 정리되며 목록에서 지워집니다.
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  삭제를 진행하려면 아래에 <span className="text-rose-600 underline font-black">[{targetStudentForDelete.name}]</span> 을(를) 똑같이 입력해 주세요.
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
                {deleteLoading ? '삭제 중...' : '원생 삭제 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
