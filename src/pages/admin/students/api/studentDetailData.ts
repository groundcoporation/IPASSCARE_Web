import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeError } from '../../../../errors/appError.ts';
import type { Student, PackageOption, PickupSpotOption, StudentDetailPeriod, StudentDetailSnapshot } from '../types';

const defaultAssignment = () => ({ class_schedule_id: '', package_option_id: '', billing_cycle: '월 기간제', payment_day: '매월 1일' });

export function emptyStudentDetail(): StudentDetailSnapshot {
  return {
    pickupSpots: [], pickupSpotId: '', dropoffSpotId: '', pickupDetailLocation: '', dropoffDetailLocation: '',
    currentPackageLabels: [], currentBillingPlanMismatches: [], currentMonthBillingLocked: false,
    additionalPackageOptionId: '', currentMonthPackageSource: 'none', currentMonthPackages: [], currentMonthClassIds: [],
    nextMonthClassIds: [], nextMonthPackageSource: 'none', nextMonthPackages: [],
  };
}

/** Read-only detail snapshot. Keep the existing billing precedence; never publish partial data. */
export async function loadStudentDetailData(
  student: Student, packageOptions: PackageOption[], period: StudentDetailPeriod,
  { client }: { client: Pick<SupabaseClient, 'from'> },
): Promise<StudentDetailSnapshot> {
  if (!student.child_id) return emptyStudentDetail();
  try {
    const [{ data: spotRows, error: spotError }, { data: pickupSetting, error: pickupSettingError }] = await Promise.all([
      client
        .from('pickup_spots')
        .select('id, name, address')
        .eq('branch_id', student.branch_id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name'),
      client
        .from('pickup_settings')
        .select('pickup_spot_id, dropoff_spot_id, detail_location, dropoff_detail_location')
        .eq('child_id', student.child_id)
        .maybeSingle(),
    ]);
    if (spotError) throw spotError;
    if (pickupSettingError) throw pickupSettingError;
    const pickupSpots = (spotRows || []) as PickupSpotOption[];
    const pickupSpotId = pickupSetting?.pickup_spot_id || '';
    const dropoffSpotId = pickupSetting?.dropoff_spot_id || '';
    const pickupDetailLocation = pickupSetting?.detail_location || '';
    const dropoffDetailLocation = pickupSetting?.dropoff_detail_location || '';

    const [
      { data: owned, error: ownedError },
      { data: plans, error: plansError },
      { data: currentBills, error: currentBillsError },
      { data: currentPlans, error: currentPlansError },
      { data: previousPlans, error: previousPlansError },
      { data: previousBills, error: previousBillsError },
      { data: billingRevisions, error: billingRevisionError },
      { data: recurringPlans, error: recurringPlanError },
    ] = await Promise.all([
      client
        .from('user_packages')
        .select('id, package_id, option_id, package_name, status, remaining_count, valid_from, valid_until, expiry_date')
        .eq('child_id', student.child_id)
        .eq('status', 'active'),
      client
        .from('academy_student_monthly_plans')
        .select('id, item_type, class_schedule_id, package_option_id, billing_cycle, payment_day, status, billing_source')
        .eq('student_id', student.id)
        .eq('effective_month', period.nextMonthStart)
        .eq('status', 'planned'),
      client
        .from('academy_bills')
        .select('id, package_option_id, amount_paid, status, payment_request_id')
        .eq('student_id', student.id)
        .eq('bill_month', period.currentMonth),
      client
        .from('academy_student_monthly_plans')
        .select('id, item_type, class_schedule_id, package_option_id, billing_cycle, payment_day, status, billing_source')
        .eq('student_id', student.id)
        .eq('effective_month', `${period.currentMonth}-01`)
        .in('status', ['planned', 'applied']),
      client
        .from('academy_student_monthly_plans')
        .select('package_option_id')
        .eq('student_id', student.id)
        .eq('effective_month', `${period.previousMonth}-01`)
        .eq('item_type', 'package')
        .in('status', ['planned', 'applied']),
      client
        .from('academy_bills')
        .select('package_option_id')
        .eq('student_id', student.id)
        .eq('bill_month', period.previousMonth),
      client
        .from('academy_student_billing_plan_revisions')
        .select('effective_month')
        .eq('student_id', student.id)
        .lte('effective_month', period.nextMonthStart)
        .order('effective_month', { ascending: false }),
      client
        .from('academy_student_monthly_plans')
        .select('effective_month, package_option_id, billing_cycle, payment_day, package_options(packages(voucher_type))')
        .eq('student_id', student.id)
        .eq('item_type', 'package')
        .eq('billing_source', 'standard')
        .in('status', ['planned', 'applied'])
        .lte('effective_month', period.nextMonthStart),
    ]);
    for (const error of [ownedError, plansError, currentBillsError, currentPlansError, previousPlansError, previousBillsError]) {
      if (error) throw error;
    }
    if (billingRevisionError) throw billingRevisionError;
    if (recurringPlanError) throw recurringPlanError;
    const today = period.today;
    const ownedRows = ((owned || []) as Array<{
      id: string;
      package_id: string | null;
      option_id: string | null;
      package_name: string | null;
      remaining_count: number | null;
      valid_until: string | null;
      expiry_date: string | null;
      valid_from: string | null;
    }>).filter((row) => {
      const expiresOn = row.valid_until || row.expiry_date || null;
      if (expiresOn && expiresOn < today) return false;
      return true;
    });
    const currentPackageLabels = Array.from(new Set(ownedRows.map((row) => row.package_name).filter(Boolean) as string[]));
    const currentBillRows = (currentBills || []) as Array<{
      package_option_id: string | null;
      amount_paid: number | null;
      status: string | null;
    }>;
    const activeCurrentBillRows = currentBillRows.filter((bill) =>
      !['cancelled', 'void', 'deleted'].includes(bill.status || 'unpaid')
    );
    const currentPlanRows = (currentPlans || []) as any[];
    const [currentBillYear, currentBillMonthNumber] = period.currentMonth.split('-').map(Number);
    const mismatchMonthStart = `${period.currentMonth}-01`;
    const currentMonthEnd = new Date(Date.UTC(currentBillYear, currentBillMonthNumber, 0)).toISOString().slice(0, 10);
    const mismatchRows = currentPlanRows
      .filter((plan) => plan.item_type === 'package' && plan.package_option_id)
      .flatMap((plan) => {
        const plannedOption = packageOptions.find((option) => option.id === plan.package_option_id);
        if (!plannedOption) return [];
        const overlappingOwned = ownedRows.filter((row) => (
          Boolean(row.option_id)
          && row.package_id === plannedOption.package_id
          && (!row.valid_from || row.valid_from <= currentMonthEnd)
          && (!(row.valid_until || row.expiry_date) || (row.valid_until || row.expiry_date)! >= mismatchMonthStart)
        ));
        if (overlappingOwned.some((row) => row.option_id === plan.package_option_id)) return [];
        const distinctActualOptionIds = [...new Set(overlappingOwned.map((row) => row.option_id).filter(Boolean))];
        if (distinctActualOptionIds.length !== 1) return [];
        const actualOwned = overlappingOwned.find((row) => row.option_id === distinctActualOptionIds[0]);
        if (!actualOwned?.option_id) return [];
        const actualOption = packageOptions.find((option) => option.id === actualOwned.option_id);
        if (!actualOption) return [];
        return [{
          planId: plan.id,
          plannedOptionId: plannedOption.id,
          plannedLabel: `${plannedOption.packages?.name || '이용권'} · ${plannedOption.label}`,
          userPackageId: actualOwned.id,
          actualOptionId: actualOption.id,
          actualLabel: `${actualOption.packages?.name || '이용권'} · ${actualOption.label}`,
        }];
      });
    const currentBillingPlanMismatches = mismatchRows;
    const hasCurrentMonthIssuedPackage = ownedRows.some((row) => (
      (!row.valid_from || row.valid_from.slice(0, 10) <= currentMonthEnd)
      && (!row.valid_until && !row.expiry_date || (row.valid_until || row.expiry_date)!.slice(0, 10) >= `${period.currentMonth}-01`)
    ));
    const currentMonthBillingLocked = 
      activeCurrentBillRows.length > 0
      || currentPlanRows.some((plan) => plan.item_type === 'package' && plan.status === 'applied')
      || hasCurrentMonthIssuedPackage;
    const additionalPackageOptionId = '';
    const currentPlanPackageIds = currentPlanRows
      .filter((plan) => plan.item_type === 'package')
      .map((plan) => plan.package_option_id)
      .filter(Boolean) as string[];
    const currentBillPackageIds = activeCurrentBillRows
      .map((bill) => bill.package_option_id)
      .filter(Boolean) as string[];
    const previousPlanPackageIds = (previousPlans || [])
      .map((plan: any) => plan.package_option_id)
      .filter(Boolean) as string[];
    const previousBillPackageIds = (previousBills || [])
      .map((bill: any) => bill.package_option_id)
      .filter(Boolean) as string[];
    const revisionRows = (billingRevisions || []) as Array<{ effective_month: string }>;
    const recurringPlanRows = (recurringPlans || []) as Array<{
      effective_month: string;
      package_option_id: string | null;
      billing_cycle: string | null;
      payment_day: string | null;
      package_options?: {
        packages?: { voucher_type: string | null } | null;
      } | null;
    }>;
    const currentMonthStart = `${period.currentMonth}-01`;
    const currentRevisionMonth = revisionRows.find((revision) =>
      revision.effective_month <= currentMonthStart
    )?.effective_month || null;
    const nextRevisionMonth = revisionRows[0]?.effective_month || null;
    const isRecurringAtMonth = (plan: typeof recurringPlanRows[number], targetMonth: string) => {
      return plan.effective_month <= targetMonth;
    };
    const currentRecurringRows = currentRevisionMonth
      ? recurringPlanRows.filter((plan) =>
          plan.effective_month === currentRevisionMonth && isRecurringAtMonth(plan, currentMonthStart)
        )
      : [];
    const nextRecurringRows = nextRevisionMonth
      ? recurringPlanRows.filter((plan) =>
          plan.effective_month === nextRevisionMonth && isRecurringAtMonth(plan, period.nextMonthStart)
        )
      : [];
    const currentRecurringPackageIds = currentRecurringRows
      .map((plan) => plan.package_option_id)
      .filter(Boolean) as string[];
    const currentPackageOptionIds = currentRevisionMonth
      ? currentRecurringPackageIds
      : currentPlanPackageIds.length > 0
        ? currentPlanPackageIds
        : currentBillPackageIds.length > 0
          ? currentBillPackageIds
          : previousPlanPackageIds.length > 0
            ? previousPlanPackageIds
            : previousBillPackageIds;
    const fallbackOwnedOptionIds = ownedRows.map((row) => row.option_id).filter(Boolean) as string[];
    const currentMonthPackageSource: StudentDetailSnapshot['currentMonthPackageSource'] = 
      currentRevisionMonth ? 'current_plan'
        : currentPlanPackageIds.length > 0 ? 'current_plan'
        : currentBillPackageIds.length > 0 ? 'current_bill'
          : previousPlanPackageIds.length > 0 ? 'previous_plan'
            : previousBillPackageIds.length > 0 ? 'previous_bill'
              : fallbackOwnedOptionIds.length > 0 ? 'active_owned'
                : 'none';
    const visibleCurrentPackageIds = currentRevisionMonth
      ? currentPackageOptionIds
      : currentPackageOptionIds.length > 0
        ? currentPackageOptionIds
        : fallbackOwnedOptionIds;
    const currentMonthPackages = Array.from(new Set(visibleCurrentPackageIds))
      .map((optionId) => ({
        ...defaultAssignment(),
        package_option_id: optionId,
      }));
    const plannedCurrentClassIds = currentPlanRows
      .filter((plan) => plan.item_type === 'class')
      .map((plan) => plan.class_schedule_id)
      .filter(Boolean);
    const currentMonthClassIds = plannedCurrentClassIds.length > 0
      ? plannedCurrentClassIds
      : (student.app_schedule_classes || []).map((schedule) => schedule.id);
    const planRows = (plans || []) as any[];
    const nextMonthClassIds = planRows.length > 0
      ? planRows.filter((plan) => plan.item_type === 'class').map((plan) => plan.class_schedule_id).filter(Boolean)
      : (student.app_schedule_classes || []).map((schedule) => schedule.id);
    const nextMonthPlanPackageRows = planRows.filter((plan) =>
      plan.item_type === 'package' && Boolean(plan.package_option_id)
    );
    const inheritedNextMonthRowsRaw = nextMonthPlanPackageRows.length > 0
      ? nextMonthPlanPackageRows
      : nextRevisionMonth
        ? nextRecurringRows
        : (currentRevisionMonth
          ? currentPackageOptionIds
          : currentPackageOptionIds.length > 0 ? currentPackageOptionIds : fallbackOwnedOptionIds)
          .map((optionId) => ({
            effective_month: currentMonthStart,
            package_option_id: optionId,
            billing_cycle: '월 기간제',
            payment_day: '매월 1일',
          }));
    const nextMonthPackageSource: StudentDetailSnapshot['nextMonthPackageSource'] = 
      nextMonthPlanPackageRows.length > 0
        ? 'saved_month'
        : nextRevisionMonth
          ? 'saved_recurring'
          : inheritedNextMonthRowsRaw.length > 0
            ? 'preview'
            : 'none';
    const inheritedNextMonthRows = Array.from(new Map(
      inheritedNextMonthRowsRaw
        .filter((plan) => Boolean(plan.package_option_id))
        .map((plan) => [plan.package_option_id, plan]),
    ).values());
    const nextMonthPackages = inheritedNextMonthRows.map((plan) => ({
          class_schedule_id: '',
          package_option_id: plan.package_option_id || '',
          billing_cycle: plan.billing_cycle || '월 기간제',
          payment_day: plan.payment_day || '매월 1일',
        }));

    return { pickupSpots, pickupSpotId, dropoffSpotId, pickupDetailLocation, dropoffDetailLocation, currentPackageLabels, currentBillingPlanMismatches, currentMonthBillingLocked, additionalPackageOptionId, currentMonthPackageSource, currentMonthPackages, currentMonthClassIds, nextMonthClassIds, nextMonthPackageSource, nextMonthPackages };
  } catch (error: unknown) {
    throw normalizeError(error, 'STUDENT_LOAD_FAILED');
  }
}
