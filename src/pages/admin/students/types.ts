import type { ActiveAppSchedule } from '../../../lib/adminScheduleAssignments';

export interface StudentSaveInput {
  editingId: string | null;
  editingStudent: Student | null;
  selectedBranchId: string;
  studentName: string;
  parentName: string;
  attendanceCode: string;
  motherPhone: string;
  fatherPhone: string;
  studentPhone: string;
  birthDate: string;
  schoolName: string;
  gradeLevel: string;
  address: string;
  admissionDate: string;
  memo: string;
  pickupSpotId: string;
  dropoffSpotId: string;
  pickupDetailLocation: string;
  dropoffDetailLocation: string;
  nextEffectiveMonth: string;
  isSmsEnabled: boolean;
  classAssignments: ClassAssignment[];
  pickupSpots: PickupSpotOption[];
  currentMonthClassIds: string[];
  currentMonthPackages: ClassAssignment[];
  applyCurrentClassesToNextMonth: boolean;
  nextMonthClassIds: string[];
  nextMonthPackages: ClassAssignment[];
  currentMonthBillingLocked: boolean;
}

export interface PickupSpotOption {
  id: string;
  name: string;
  address: string | null;
}


export interface ClassAssignment {
  class_schedule_id: string;
  package_option_id: string;
  billing_cycle: string;
  payment_day: string;
}


export interface StudentDetailPeriod {
  currentMonth: string;
  previousMonth: string;
  nextMonthStart: string;
  today: string;
}

export interface StudentDetailSnapshot {
  pickupSpots: PickupSpotOption[];
  pickupSpotId: string;
  dropoffSpotId: string;
  pickupDetailLocation: string;
  dropoffDetailLocation: string;
  currentPackageLabels: string[];
  currentBillingPlanMismatches: Array<{
    planId: string; plannedOptionId: string; plannedLabel: string;
    userPackageId: string; actualOptionId: string; actualLabel: string;
  }>;
  currentMonthBillingLocked: boolean;
  additionalPackageOptionId: string;
  currentMonthPackageSource: 'current_plan' | 'current_bill' | 'previous_plan' | 'previous_bill' | 'active_owned' | 'none';
  currentMonthPackages: ClassAssignment[];
  currentMonthClassIds: string[];
  nextMonthClassIds: string[];
  nextMonthPackageSource: 'saved_month' | 'saved_recurring' | 'preview' | 'none';
  nextMonthPackages: ClassAssignment[];
}

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


export interface Student {
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
    parent_id?: string | null;
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


export interface UnregisteredMember {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  branch_id: string | null;
  created_at: string;
}


export interface ClassSchedule {
  id: string;
  target_class: string;
  branch_id: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
}


export interface PackageOption {
  id: string;
  package_id: string;
  label: string;
  price: number;
  branch_id: string;
  packages: {
    name: string;
    voucher_type: string | null;
  } | null;
}
