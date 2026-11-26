import { AppError } from '../../../../errors/appError.ts';
import { allocateDiscountedBillAmounts, normalizeDiscountPercent } from '../../../../utils/billingAmount.ts';
import type { OwnedPackageTarget } from '../types';

export type BillDiscountMode = 'none' | '5percent' | '10percent' | 'custom_percent' | 'custom_amount';
export interface BillGenerationAdjustment {
  mode: BillDiscountMode;
  percent: string;
  finalAmounts: Record<string, string>;
  reason: string;
}
export interface ManualBillParameters {
  p_student_id: string;
  p_plan_id: string | null;
  p_package_option_id: string;
  p_bill_month: string;
  p_original_amount: number;
  p_discount_type: 'none' | 'percent' | 'final_amount';
  p_discount_value: number;
  p_discount_amount: number;
  p_amount_due: number;
  p_adjustment_reason: string | null;
  p_memo: string;
}
export interface PreparedBillItem {
  parameters: ManualBillParameters | null;
  error?: AppError;
}
export const billingTargetKey = (target: OwnedPackageTarget) =>
  `${target.studentId}:${target.userPackageId}:${target.optionId || 'none'}`;

/** Preserve the existing total-first discount allocation and per-option RPC payload. */
export function prepareBillGeneration(targets: OwnedPackageTarget[], month: string, adjustment: BillGenerationAdjustment): PreparedBillItem[] {
  if (!targets.length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError('INPUT_INVALID');
  if (adjustment.mode === 'custom_percent' && (adjustment.percent.trim() === '' || !Number.isFinite(Number(adjustment.percent)) || Number(adjustment.percent) < 0 || Number(adjustment.percent) > 100)) throw new AppError('INPUT_INVALID');
  const percent = adjustment.mode === '5percent' ? 5 : adjustment.mode === '10percent' ? 10
    : adjustment.mode === 'custom_percent' ? normalizeDiscountPercent(Number(adjustment.percent)) : 0;
  const amounts = adjustment.mode === 'custom_amount' ? []
    : allocateDiscountedBillAmounts(targets.map(target => Number(target.price || 0)), percent);
  return targets.map((target, index) => {
    const original = Number(target.price || 0);
    const customInput = adjustment.finalAmounts[billingTargetKey(target)] ?? String(original);
    const customAmount = Number(customInput.replace(/[^0-9]/g, ''));
    if (adjustment.mode === 'custom_amount' && (customInput.trim() === '' || !Number.isSafeInteger(customAmount) || customAmount > 2147483647)) throw new AppError('INPUT_INVALID');
    if (!target.optionId) return { parameters: null, error: new AppError('BILL_OPTION_INVALID') };
    const finalAmount = adjustment.mode === 'custom_amount' ? Math.max(0, customAmount || 0) : amounts[index];
    const discountType = adjustment.mode === 'custom_amount' ? 'final_amount' : percent > 0 ? 'percent' : 'none';
    return { parameters: {
      p_student_id: target.studentId,
      p_plan_id: target.userPackageId.startsWith('plan:') ? target.userPackageId.slice(5) : null,
      p_package_option_id: target.optionId, p_bill_month: month, p_original_amount: original,
      p_discount_type: discountType,
      p_discount_value: discountType === 'final_amount' ? finalAmount : discountType === 'percent' ? percent : 0,
      p_discount_amount: original - finalAmount, p_amount_due: finalAmount,
      p_adjustment_reason: adjustment.reason.trim() || null,
      p_memo: target.isShared
        ? `보유 이용권: ${target.packageName} (${target.optionLabel}) | 적용 대상: 가족 공용`
        : `보유 이용권: ${target.packageName} (${target.optionLabel}) | 연결 수업: ${target.classNames.join(', ') || '없음'}`,
    } };
  });
}
