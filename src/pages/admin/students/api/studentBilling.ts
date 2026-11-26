import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';

type Dependencies = { client: Pick<SupabaseClient, 'rpc'> };

/** One RPC only. Never retry or fall back to direct table writes. */
export async function addStudentAdditionalBilling(studentId: string, packageOptionId: string, { client }: Dependencies): Promise<void> {
  try {
    if (!studentId.trim() || !packageOptionId.trim()) throw new AppError('REQUIRED_DATA_MISSING');
    const { error } = await client.rpc('add_current_month_student_additional_billing_plan', {
      p_student_id: studentId, p_package_option_id: packageOptionId,
    });
    if (error) throw error;
  } catch (error: unknown) {
    throw normalizeError(error, 'BILL_PLAN_CHANGE_UNCONFIRMED');
  }
}

export async function correctStudentBillingPlan(planId: string, userPackageId: string, { client }: Dependencies): Promise<void> {
  try {
    if (!planId.trim() || !userPackageId.trim()) throw new AppError('REQUIRED_DATA_MISSING');
    const { error } = await client.rpc('correct_billing_plan_to_owned_package', {
      p_plan_id: planId, p_user_package_id: userPackageId,
    });
    if (error) throw error;
  } catch (error: unknown) {
    throw normalizeError(error, 'BILL_PLAN_CHANGE_UNCONFIRMED');
  }
}
