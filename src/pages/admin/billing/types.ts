export interface OwnedPackageTarget {
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
  parentUserId?: string;
  isShared?: boolean;
  isAdditional?: boolean;
  entitlementMismatch?: boolean;
  actualUserPackageId?: string;
  actualOptionId?: string;
  actualOptionLabel?: string;
}


export interface BillingPackageOption {
  id: string;
  label: string;
  price: number;
  packageName: string;
  voucherType: string;
}


export interface BillingTargetStudent {
  studentId: string;
  studentName: string;
  isSmsEnabled: boolean;
  packages: OwnedPackageTarget[];
}


export interface TargetBillStatus {
  status: string;
  paymentRequestId: string | null;
}


export interface BillingTargetReadSnapshot {
  activeStudents: unknown[];
  billingPackages: unknown[];
  planRevisions: unknown[];
  monthlyPlanRows: unknown[];
  appAssignments: unknown[];
  ownedPackages: unknown[];
  sharedShuttlePackages: unknown[];
  options: unknown[];
  issuedBills: unknown[];
}

export interface BillingTargetSnapshot {
  billingPackageOptions: BillingPackageOption[];
  billingRosterStudents: BillingTargetStudent[];
  targets: OwnedPackageTarget[];
  targetBillStatuses: Record<string, TargetBillStatus>;
}
export interface Bill {
  id: string;
  branch_id: string;
  student_id: string;
  class_schedule_id: string | null;
  package_option_id: string | null;
  bill_month: string;
  amount_due: number;
  original_amount?: number;
  discount_type?: 'none' | 'percent' | 'final_amount';
  discount_value?: number;
  discount_amount?: number;
  adjustment_reason?: string | null;
  amount_paid: number;
  billing_date: string;
  payment_date: string | null;
  payment_method: string | null;
  status: string; // unpaid, paid, refunded
  memo: string | null;
  payment_request_id?: string | null;
  app_sent_at?: string | null;
  reminder_count?: number;
  last_reminded_at?: string | null;
  academy_students: {
    student_name: string;
    parent_user_id: string | null;
    child_id: string | null;
    archived_at?: string | null;
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


export interface OfflinePayment {
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


export interface AppPaymentRequest {
  id: string;
  parent_id: string;
  parent_name: string | null;
  branch_id: string | null;
  final_amount: number;
  total_amount: number;
  status: string;
  request_title: string | null;
  request_type: string | null;
  issued_source: string | null;
  beneficiary_name: string | null;
  created_at: string;
  closed_at: string | null;
  reminder_count?: number;
  last_reminded_at?: string | null;
}
