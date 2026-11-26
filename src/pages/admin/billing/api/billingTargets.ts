import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeError } from '../../../../errors/appError.ts';
import { billingMonthPeriod } from '../model/billingPeriod.ts';
import { buildBillingTargets } from '../model/billingTargetCalculation.ts';

/** Preserve query filters and order; publish only a complete billing-target snapshot. */
export async function loadBillingTargetData(activeBranchId: string | null, selectedMonth: string, { client }: { client: Pick<SupabaseClient, 'from'> }) {
  try {
    const { data: students, error: studentError } = await client
      .from('academy_students')
      .select(`
        id,
        student_name,
        parent_user_id,
        branch_id,
        is_sms_enabled,
        child_id,
        child:children(deleted_at, parent_id),
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
      `).is('archived_at', null);
    if (studentError) throw studentError;
    const activeStudents = (students as any[] || [])
      .filter((student) =>
        (!student.child_id || student.child?.deleted_at == null)
        && (!student.parent_user_id || student.parent?.status !== 'deleted')
        && (!activeBranchId || activeBranchId === 'all' || student.branch_id === activeBranchId)
      )
      .map((student) => ({
        ...student,
        // 앱 자녀의 실제 소유자는 children.parent_id가 기준입니다.
        // 과거 전화번호 자동 연결로 academy_students가 잘못 연결됐더라도
        // 조회·청구 대상 계산에서는 올바른 학부모를 사용합니다.
        parent_user_id: student.child?.parent_id || student.parent_user_id,
      }));
    let billingPackagesQuery = client.from('packages').select(`
      id,
      name,
      voucher_type,
      branch_id,
      package_options(id, label, price)
    `);
    billingPackagesQuery = billingPackagesQuery.eq('is_active', true);
    if (activeBranchId && activeBranchId !== 'all') {
      billingPackagesQuery = billingPackagesQuery.eq('branch_id', activeBranchId);
    }
    const { data: billingPackages, error: billingPackagesError } = await billingPackagesQuery;
    if (billingPackagesError) throw billingPackagesError;
    const appStudents = activeStudents.filter(student => Boolean(student.child_id));
    const appStudentIds = appStudents.map(student => student.id);
    const childIds = appStudents.map(student => student.child_id).filter(Boolean);
    const parentUserIds = Array.from(new Set(activeStudents.map(student => student.parent_user_id).filter(Boolean)));
    const selectedPeriod = billingMonthPeriod(selectedMonth);
    const { data: planRevisions, error: planRevisionError } = appStudents.length > 0
      ? await client
          .from('academy_student_billing_plan_revisions')
          .select('student_id, effective_month')
          .lte('effective_month', selectedPeriod.start)
          .in('student_id', appStudentIds)
      : { data: [], error: null };
    if (planRevisionError) throw planRevisionError;
    const { data: monthlyPlanRows, error: monthlyPlanError } = appStudents.length > 0
      ? await client
          .from('academy_student_monthly_plans')
          .select(`
            id,
            effective_month,
            item_type,
            status,
            student_id,
            branch_id,
            class_schedule_id,
            package_option_id,
            billing_cycle,
            payment_day,
            billing_source,
            class_schedules(target_class),
            package_options(id, label, price, packages(id, name, voucher_type))
          `)
          .lte('effective_month', selectedPeriod.start)
          .in('status', ['planned', 'applied'])
          .in('student_id', appStudentIds)
      : { data: [], error: null };
    if (monthlyPlanError) throw monthlyPlanError;
    const { data: appAssignments, error: assignmentError } = childIds.length > 0
      ? await client
          .from('student_schedule_assignments')
          .select('child_id, schedule_id, starts_on, ends_on, is_active, class_schedules:schedule_id(target_class)')
          .eq('is_active', true)
          .lte('starts_on', selectedPeriod.end)
          .or(`ends_on.is.null,ends_on.gte.${selectedPeriod.start}`)
          .in('child_id', childIds)
      : { data: [], error: null };
    if (assignmentError) throw assignmentError;
    const { data: ownedPackages, error: packageError } = await client
      .from('user_packages')
      .select('id, child_id, package_id, option_id, package_name, price, voucher_type, total_count, remaining_count, status, valid_from, valid_until, expiry_date, created_at')
      .in('status', ['active', 'expired', 'exhausted'])
      .not('child_id', 'is', null)
      .in('child_id', childIds)
      .or(`valid_from.is.null,valid_from.lte.${selectedPeriod.end}`);
    if (packageError) throw packageError;
    const { data: sharedShuttlePackages, error: sharedPackageError } = parentUserIds.length > 0
      ? await client
          .from('user_packages')
          .select('id, user_id, child_id, branch_id, package_id, option_id, package_name, price, voucher_type, status, valid_from, valid_until, expiry_date, created_at')
          .in('status', ['active', 'expired', 'exhausted'])
          .is('child_id', null)
          .eq('voucher_type', 'shuttle')
          .in('user_id', parentUserIds)
          .or(`valid_from.is.null,valid_from.lte.${selectedPeriod.end}`)
      : { data: [], error: null };
    if (sharedPackageError) throw sharedPackageError;
    const allOwnedPackages = [...(ownedPackages || []), ...(sharedShuttlePackages || [])];
    const optionIds = Array.from(new Set(allOwnedPackages.map(item => item.option_id).filter(Boolean)));
    const { data: options, error: optionError } = optionIds.length > 0
      ? await client
          .from('package_options')
          .select('id, label, price, packages(name)')
          .in('id', optionIds)
      : { data: [], error: null };
    if (optionError) throw optionError;
    const rosterStudentIds = activeStudents.map(student => student.id);
    const { data: issuedBills, error: issuedBillError } = rosterStudentIds.length > 0
      ? await client
          .from('academy_bills')
          .select(`
            id,
            student_id,
            package_option_id,
            bill_month,
            amount_due,
            status,
            payment_request_id,
            package_options(id, label, price, packages(id, name, voucher_type))
          `)
          .in('student_id', rosterStudentIds)
          .eq('bill_month', selectedMonth)
      : { data: [], error: null };
    if (issuedBillError) throw issuedBillError;
    return buildBillingTargets(selectedMonth, {
      activeStudents, billingPackages: billingPackages || [], planRevisions: planRevisions || [],
      monthlyPlanRows: monthlyPlanRows || [], appAssignments: appAssignments || [], ownedPackages: ownedPackages || [],
      sharedShuttlePackages: sharedShuttlePackages || [], options: options || [], issuedBills: issuedBills || [],
    });
  } catch (error: unknown) {
    throw normalizeError(error, 'BILL_LOAD_FAILED');
  }
}
