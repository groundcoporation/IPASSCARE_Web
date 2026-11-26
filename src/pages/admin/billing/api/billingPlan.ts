import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
type Dependencies = { client: Pick<SupabaseClient, 'rpc'> };
const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function validate(studentId: string, month: string) {
  if (!isUuid(studentId)) throw new AppError('INPUT_INVALID');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError('BILL_MONTH_INVALID');
}

/** Existing RPCs only. No automatic extra charge, retry, or table fallback. */
export async function saveStandardBillingPlan(studentId: string, month: string, optionIds: string[], { client }: Dependencies): Promise<void> {
  try {
    validate(studentId, month);
    if (!optionIds.every(isUuid)) throw new AppError('INPUT_INVALID');
    const unique = [...new Set(optionIds)];
    const { data, error } = await client.rpc('save_student_monthly_package_plan', {
      p_student_id: studentId, p_effective_month: month + '-01', p_package_option_ids: unique,
    });
    if (error) throw error;
    if (data?.success !== true || data.effective_month !== month + '-01' || data.package_count !== unique.length) throw new AppError('BILL_PLAN_CHANGE_UNCONFIRMED');
  } catch (error: unknown) { throw normalizeError(error, 'BILL_PLAN_CHANGE_UNCONFIRMED'); }
}

export async function addAdditionalBillingPlan(studentId: string, month: string, optionId: string, { client }: Dependencies): Promise<void> {
  try {
    validate(studentId, month);
    if (!isUuid(optionId)) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.rpc('add_student_additional_billing_plan', {
      p_student_id: studentId, p_package_option_id: optionId, p_effective_month: month + '-01',
    });
    if (error) throw error;
    if (data?.success !== true || !isUuid(data.plan_id) || data.student_id !== studentId || data.package_option_id !== optionId || data.bill_month !== month) throw new AppError('BILL_PLAN_CHANGE_UNCONFIRMED');
  } catch (error: unknown) { throw normalizeError(error, 'BILL_PLAN_CHANGE_UNCONFIRMED'); }
}

export async function deleteAdditionalBillingPlan(studentId: string, month: string, planId: string, optionId: string | null, { client }: Dependencies): Promise<void> {
  try {
    validate(studentId, month);
    if (!isUuid(planId) || !isUuid(optionId)) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.rpc('delete_planned_additional_student_billing_item', { p_plan_id: planId });
    if (error) throw error;
    if (data?.success !== true || data.plan_id !== planId || data.student_id !== studentId || data.package_option_id !== optionId || data.bill_month !== month) throw new AppError('BILL_PLAN_CHANGE_UNCONFIRMED');
  } catch (error: unknown) { throw normalizeError(error, 'BILL_PLAN_CHANGE_UNCONFIRMED'); }
}
