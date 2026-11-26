import { billingMonthPeriod } from './billingPeriod.ts';
import type { OwnedPackageTarget, TargetBillStatus, BillingTargetReadSnapshot, BillingTargetSnapshot } from '../types';

/** Pure projection of successful reads. No DB calls, pricing policy changes or state setters. */
export function buildBillingTargets(selectedMonth: string, snapshot: BillingTargetReadSnapshot): BillingTargetSnapshot {
  // Legacy PostgREST join shapes are kept at this boundary until generated DB types are introduced.
  const { billingPackages, planRevisions, monthlyPlanRows, appAssignments, ownedPackages, sharedShuttlePackages, options, issuedBills } = snapshot;
  const activeStudents = snapshot.activeStudents as any[];
  const billingPackageOptions = ((billingPackages || []) as any[])
    .filter((pkg) => (pkg.voucher_type || 'lesson') !== 'gps')
    .flatMap((pkg) => (pkg.package_options || []).map((option: any) => ({
      id: option.id,
      label: option.label,
      price: Number(option.price || 0),
      packageName: pkg.name || '이용권',
      voucherType: pkg.voucher_type || 'lesson',
    })));
  const billingRosterStudents = activeStudents.map((student) => ({
    studentId: student.id,
    studentName: student.student_name || '원생',
    isSmsEnabled: student.is_sms_enabled !== false,
    packages: [],
  }));
  const appStudents = activeStudents.filter((student) => Boolean(student.child_id));
  const webOnlyStudents = activeStudents.filter((student) => !student.child_id);
  const studentByChildId = new Map(appStudents.map((student) => [student.child_id, student]));
  const parentUserIdByStudentId = new Map(
    activeStudents.map((student) => [student.id, student.parent_user_id || null]),
  );
  const studentsByParentId = new Map<string, any[]>();
  activeStudents.forEach((student) => {
    if (!student.parent_user_id) return;
    const siblings = studentsByParentId.get(student.parent_user_id) || [];
    siblings.push(student);
    studentsByParentId.set(student.parent_user_id, siblings);
  });
  studentsByParentId.forEach((siblings) => siblings.sort((left, right) => String(left.id).localeCompare(String(right.id))));
  const selectedPeriod = billingMonthPeriod(selectedMonth);

  const latestRevisionByStudent = new Map<string, string>();
  (planRevisions as any[] || []).forEach((revision) => {
    const previous = latestRevisionByStudent.get(revision.student_id);
    if (!previous || revision.effective_month > previous) {
      latestRevisionByStudent.set(revision.student_id, revision.effective_month);
    }
  });

  const monthlyPlans = (monthlyPlanRows as any[] || []).filter((plan) => {
    if (plan.item_type === 'class') return plan.effective_month === selectedPeriod.start;
    if (plan.billing_source === 'additional') return plan.effective_month === selectedPeriod.start;
    const latestRevisionMonth = latestRevisionByStudent.get(plan.student_id);
    // Legacy plans created before revision tracking have no corresponding
    // academy_student_billing_plan_revisions row. Student Management still
    // treats an exact-month row as valid, so Billing must do the same.
    return latestRevisionMonth
      ? plan.effective_month === latestRevisionMonth
      : plan.effective_month === selectedPeriod.start;
  });

  // Resolve assignments effective during the selected billing month.
  // Future-dated assignments must not leak into the current month.

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

  // A vehicle pass may intentionally be issued to the parent as a shared
  // package. Fetch only shared shuttle passes here; other shared lesson,
  // single-item, bundle, and GPS products must stay out of tuition billing.

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
  // Legacy app-issued packages can be genuinely active without a validity
  // window. They are already usable in the app, so billing must show them
  // as renewed instead of incorrectly offering another invoice.
  const isUndatedActivePackage = (owned: any) =>
    owned.status === 'active' && !owned.valid_from && !packageEnd(owned);
  // One-off purchases remain as payment/package history, but must never
  // become a recurring tuition candidate in a later month.
  const isOneTimePackage = (owned: any) => {
    const name = String(owned.package_name || '');
    return Number(owned.total_count) === 1
      || /등록비|단품/.test(name)
      || /키\s*성장\s*프로그램\s*집중\s*케어.*1\s*회/.test(name);
  };
  const canAutoRenew = (owned: any) => !isOneTimePackage(owned);
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
        .filter((owned) => overlaps(owned, selectedPeriod) || isUndatedActivePackage(owned))
        .sort(newestFirst)[0];
      const renewalSourcePackage = ownedGroup
        .filter((owned) => canAutoRenew(owned) && (overlaps(owned, previousPeriod)
          || (!owned.valid_from && !packageEnd(owned) && owned.status === 'active'))
        )
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

  // For an app-linked student, the current-month plan saved in Student
  // Management is the sole billing instruction. App passes only tell us
  // whether that exact instruction has already been renewed; they must
  // never add a second billing row by themselves.
  const currentMonthPlanRows = monthlyPlans as any[] || [];
  // Both draft and applied plans are billing instructions. Applied plans
  // often mean that an academy_bills row was already created, while the
  // app pass is intentionally not issued until payment/renewal. Omitting
  // them makes a billed student appear as "청구 대상 없음".
  const plannedRows = currentMonthPlanRows.filter((plan) =>
    plan.status === 'planned' || plan.status === 'applied',
  );
  const plannedClassNamesByStudent = new Map<string, string[]>();
  currentMonthPlanRows.filter((plan) => plan.item_type === 'class').forEach((plan) => {
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
    const isAdditional = plan.billing_source === 'additional';
    const key = isAdditional
      ? `${plan.student_id}:${plan.package_option_id}:additional:${plan.id}`
      : `${plan.student_id}:${plan.package_option_id}`;
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
      optionLabel: isAdditional
        ? `추가 청구 · ${option.label || '요금제 정보 없음'}`
        : option.label || '요금제 정보 없음',
      price: Number(option.price || 0),
      billingCycle: plan.billing_cycle || '월 기간제',
      paymentDay: plan.payment_day || '매월 1일',
      // The class shown in Billing is operational information, so read it
      // from the app's effective schedule assignment first. Previously it
      // depended only on the monthly billing-plan snapshot; opening Student
      // Management and pressing Save happened to create that snapshot,
      // which made an already assigned class look missing until then.
      classNames: student.child_id
        ? (appClassNamesByChildId.get(student.child_id)
          || plannedClassNamesByStudent.get(plan.student_id)
          || [])
        : (plannedClassNamesByStudent.get(plan.student_id) || []),
      isAdditional,
    });
  });
  const plannedTargets = Array.from(plannedTargetsByStudentAndOption.values());
  // A monthly plan is a billing instruction, not proof that an issued app
  // package is missing. Match plans to issued packages by option first so
  // an already-issued September package stays visible as "갱신 완료".

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
    .flatMap((ownedGroup): OwnedPackageTarget[] => {
      const targetMonthPackage = ownedGroup
        .filter((owned) => overlaps(owned, selectedPeriod) || isUndatedActivePackage(owned))
        .sort(newestFirst)[0];
      const renewalSourcePackage = ownedGroup
        .filter((owned) => overlaps(owned, previousPeriod)
          || (!owned.valid_from && !packageEnd(owned) && owned.status === 'active'))
        .sort(newestFirst)[0];
      const owned = targetMonthPackage || renewalSourcePackage;
      if (!owned) return [];

      const representativeStudent = (studentsByParentId.get(owned.user_id) || [])
        .find((student) => !owned.branch_id || student.branch_id === owned.branch_id);
      if (!representativeStudent) return [];
      const option: any = owned.option_id ? optionById.get(owned.option_id) : null;
      return [{
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
        parentUserId: owned.user_id,
        isShared: true,
      } satisfies OwnedPackageTarget];
    });

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

  // Student Management is the only source of billing targets. Issued app
  // passes never create a billing row; they only tell us whether the exact
  // plan has already been renewed for the selected month.
  const normalizeProductName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizeOptionLabel = (value: string) => value.replace(/[\s·._-]+/g, '').toLowerCase();
  const commercialKey = (target: OwnedPackageTarget) => [
    target.studentId,
    (target.voucherType || 'lesson').toLowerCase(),
    normalizeOptionLabel(target.optionLabel),
    Number(target.price || 0),
  ].join(':');
  const currentChildOptionKeys = new Set<string>();
  const currentChildLegacyProductKeys = new Set<string>();
  const currentChildCommercialKeys = new Set<string>();
  appTargets
    .filter((target) => target.hasTargetMonthPackage)
    .forEach((target) => {
      if (target.optionId) {
        currentChildOptionKeys.add(`${target.studentId}:${target.optionId}`);
      }
      const productKey = target.packageId
        ? `package:${target.packageId}`
        : `name:${normalizeProductName(target.packageName)}`;
      currentChildLegacyProductKeys.add(`${target.studentId}:${productKey}`);
      if (target.optionLabel && Number(target.price || 0) > 0) {
        currentChildCommercialKeys.add(commercialKey(target));
      }
    });
  const currentSharedShuttleOptionKeys = new Set<string>();
  const currentSharedShuttleLegacyProductKeys = new Set<string>();
  const currentSharedShuttleCommercialKeys = new Set<string>();
  sharedShuttleTargets
    .filter((target) => target.hasTargetMonthPackage && target.parentUserId)
    .forEach((target) => {
      const prefix = `${target.parentUserId}:${target.branchId}`;
      if (target.optionId) {
        currentSharedShuttleOptionKeys.add(`${prefix}:${target.optionId}`);
      }
      const productKey = target.packageId
        ? `package:${target.packageId}`
        : `name:${normalizeProductName(target.packageName)}`;
      currentSharedShuttleLegacyProductKeys.add(`${prefix}:${productKey}`);
      if (target.optionLabel && Number(target.price || 0) > 0) {
        currentSharedShuttleCommercialKeys.add(`${prefix}:${normalizeOptionLabel(target.optionLabel)}:${Number(target.price || 0)}`);
      }
    });
  const plannedTargetsWithRenewalState = plannedTargets.map((target) => {
    if (target.isAdditional) return target;
    const parentUserId = parentUserIdByStudentId.get(target.studentId);
    const legacyProductKey = target.packageId
      ? `package:${target.packageId}`
      : `name:${normalizeProductName(target.packageName)}`;
    const hasExactChildOption = Boolean(target.optionId)
      && currentChildOptionKeys.has(`${target.studentId}:${target.optionId}`);
    const hasChildPackage = hasExactChildOption || (!target.optionId && (
      currentChildLegacyProductKeys.has(`${target.studentId}:${legacyProductKey}`)
      || (
        Boolean(target.optionLabel)
        && Number(target.price || 0) > 0
        && currentChildCommercialKeys.has(commercialKey(target))
      )
    ));
    const hasSharedShuttle = target.voucherType === 'shuttle'
      && Boolean(parentUserId)
      && (
        (
          Boolean(target.optionId)
          && currentSharedShuttleOptionKeys.has(`${parentUserId}:${target.branchId}:${target.optionId}`)
        )
        || currentSharedShuttleLegacyProductKeys.has(`${parentUserId}:${target.branchId}:${legacyProductKey}`)
        || currentSharedShuttleCommercialKeys.has(`${parentUserId}:${target.branchId}:${normalizeOptionLabel(target.optionLabel)}:${Number(target.price || 0)}`)
      );
    const mismatchedPackage = !hasExactChildOption && target.voucherType !== 'shuttle' && target.optionId
      ? appTargets.find((appTarget) => (
          appTarget.studentId === target.studentId
          && appTarget.hasTargetMonthPackage
          && Boolean(appTarget.optionId)
          && appTarget.optionId !== target.optionId
          && Boolean(target.packageId)
          && appTarget.packageId === target.packageId
        ))
      : undefined;
    return {
      ...target,
      hasTargetMonthPackage: hasChildPackage || hasSharedShuttle,
      entitlementMismatch: Boolean(mismatchedPackage),
      actualUserPackageId: mismatchedPackage?.userPackageId,
      actualOptionId: mismatchedPackage?.optionId || undefined,
      actualOptionLabel: mismatchedPackage?.optionLabel,
    };
  });

  // Shuttle products are family-shared. If several children of the same
  // parent have the same shuttle plan, expose exactly one billing target.
  // Explicit additional charges remain separate by design.
  const familyShuttleTargets = new Map<string, OwnedPackageTarget>();
  const targets: OwnedPackageTarget[] = [];
  plannedTargetsWithRenewalState.forEach((target) => {
    if (target.voucherType !== 'shuttle' || target.isAdditional) {
      targets.push(target);
      return;
    }
    const parentUserId = parentUserIdByStudentId.get(target.studentId);
    if (!parentUserId) {
      targets.push(target);
      return;
    }
    const productKey = target.optionId || target.packageId || target.packageName;
    const key = `${parentUserId}:${target.branchId}:${productKey}`;
    const existing = familyShuttleTargets.get(key);
    if (!existing) {
      familyShuttleTargets.set(key, {
        ...target,
        parentUserId,
        isShared: true,
      });
      return;
    }
    // Keep the representative student deterministic so a reload cannot
    // move the same family bill to another sibling and bypass the existing
    // academy_bills duplicate check.
    const representative = target.studentId.localeCompare(existing.studentId) < 0
      ? target
      : existing;
    familyShuttleTargets.set(key, {
      ...representative,
      hasTargetMonthPackage:
        existing.hasTargetMonthPackage || target.hasTargetMonthPackage,
      parentUserId,
      isShared: true,
    });
  });
  targets.push(...familyShuttleTargets.values(), ...webTargets);

  // Issued bills are historical state, not new billing instructions. They
  // still need a read-only row when the old plan row no longer exists so
  // paid/issued students never fall back to "no target".

  const inactiveBillStatuses = new Set(['cancelled', 'canceled', 'void', 'deleted']);
  const activeIssuedBills = (issuedBills as any[] || []).filter((bill) =>
    !inactiveBillStatuses.has(String(bill.status || 'unpaid').toLowerCase()),
  );

  activeIssuedBills.forEach((bill) => {
    if (!bill.package_option_id) return;
    const alreadyVisible = targets.some((target) =>
      target.studentId === bill.student_id
      && target.optionId === bill.package_option_id
    );
    if (alreadyVisible) return;
    const student = activeStudents.find((item) => item.id === bill.student_id);
    const option = Array.isArray(bill.package_options)
      ? bill.package_options[0]
      : bill.package_options;
    if (!student || !option) return;
    const restoredTarget: OwnedPackageTarget = {
      userPackageId: `bill:${bill.id}`,
      packageId: option.packages?.id || null,
      hasTargetMonthPackage: false,
      voucherType: option.packages?.voucher_type || 'lesson',
      studentId: student.id,
      studentName: student.student_name || '원생',
      branchId: student.branch_id,
      childId: student.child_id,
      isSmsEnabled: student.is_sms_enabled !== false,
      optionId: bill.package_option_id,
      packageName: option.packages?.name || '수강료',
      optionLabel: option.label || '요금제 정보 없음',
      price: Number(bill.amount_due ?? option.price ?? 0),
      billingCycle: '월 기간제',
      paymentDay: '발행 완료',
      classNames: plannedClassNamesByStudent.get(student.id)
        || appClassNamesByChildId.get(student.child_id)
        || [],
    };
    const legacyProductKey = restoredTarget.packageId
      ? `package:${restoredTarget.packageId}`
      : `name:${normalizeProductName(restoredTarget.packageName)}`;
    const restoredCommercialTarget = {
      ...restoredTarget,
      // A paid bill may contain a discount. Renewal identity is based on
      // the catalog option price, not the discounted amount_due.
      price: Number(option.price ?? restoredTarget.price ?? 0),
    };
    restoredTarget.hasTargetMonthPackage = (
      Boolean(restoredTarget.optionId)
      && currentChildOptionKeys.has(`${restoredTarget.studentId}:${restoredTarget.optionId}`)
    ) || currentChildLegacyProductKeys.has(`${restoredTarget.studentId}:${legacyProductKey}`)
      || (
        Boolean(restoredTarget.optionLabel)
        && Number(restoredCommercialTarget.price || 0) > 0
        && currentChildCommercialKeys.has(commercialKey(restoredCommercialTarget))
      );
    targets.push(restoredTarget);
  });

  const nextBillStatuses: Record<string, TargetBillStatus> = {};
  const billStatusPriority = (status: string | null | undefined) => {
    const normalized = String(status || 'unpaid').toLowerCase();
    if (normalized === 'paid') return 3;
    if (normalized === 'partially_paid' || normalized === 'partial') return 2;
    return 1;
  };
  activeIssuedBills.forEach((bill) => {
    const key = `${bill.student_id}:${bill.package_option_id || 'none'}:${bill.bill_month}`;
    const current = nextBillStatuses[key];
    if (current && billStatusPriority(current.status) >= billStatusPriority(bill.status)) return;
    nextBillStatuses[key] = {
      status: bill.status,
      paymentRequestId: bill.payment_request_id || null,
    };
  });


  return { billingPackageOptions, billingRosterStudents, targets, targetBillStatuses: nextBillStatuses };
}
