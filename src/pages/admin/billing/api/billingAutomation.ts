import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';

type Dependencies = { client: Pick<SupabaseClient, 'from' | 'auth'>; now?: () => Date };

async function requireActor(client: Dependencies['client']): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw normalizeError(error, 'AUTH_REQUIRED');
  if (!data.user) throw new AppError('AUTH_REQUIRED');
  return data.user.id;
}

/** Existing per-branch setting upsert. This function does not issue or send bills. */
export async function saveBillingAutomation(branchId: string, enabled: boolean, { client, now = () => new Date() }: Dependencies): Promise<void> {
  let writeAttempted = false;
  try {
    if (!branchId.trim() || branchId === 'all') throw new AppError('INPUT_INVALID');
    const actor = await requireActor(client);
    const updatedAt = now().toISOString();
    writeAttempted = true;
    const { data, error } = await client.from('academy_billing_automation_settings').upsert({
      branch_id: branchId, is_enabled: enabled, billing_day: 1, updated_by: actor, updated_at: updatedAt,
    }, { onConflict: 'branch_id' }).select('branch_id, is_enabled').single();
    if (error) throw error;
    if (data?.branch_id !== branchId || data?.is_enabled !== enabled) throw new AppError('BILL_AUTOMATION_SAVE_UNCONFIRMED');
  } catch (error: unknown) {
    const normalized = normalizeError(error, 'BILL_SETTING_FAILED');
    if (writeAttempted && ['BILL_SETTING_FAILED', 'NETWORK_ERROR'].includes(normalized.code)) {
      throw new AppError('BILL_AUTOMATION_SAVE_UNCONFIRMED', normalized);
    }
    throw normalized;
  }
}

/** A single batch upsert; preserve fixed requested values and never retry automatically. */
export async function saveBillingAutomationTargets(branchId: string, studentIds: string[], enabled: boolean, { client, now = () => new Date() }: Dependencies): Promise<void> {
  let writeAttempted = false;
  try {
    if (!branchId.trim() || branchId === 'all' || !studentIds.length || studentIds.some(id => !id.trim())) throw new AppError('INPUT_INVALID');
    const ids = Array.from(new Set(studentIds));
    const actor = await requireActor(client);
    const updatedAt = now().toISOString();
    writeAttempted = true;
    const { data, error } = await client.from('academy_billing_automation_targets').upsert(ids.map(studentId => ({
      branch_id: branchId, student_id: studentId, is_enabled: enabled, updated_by: actor, updated_at: updatedAt,
    })), { onConflict: 'branch_id,student_id' }).select('branch_id, student_id, is_enabled');
    if (error) throw error;
    const confirmedIds = new Set((data || []).filter(row => row.branch_id === branchId && row.is_enabled === enabled).map(row => row.student_id));
    if (ids.some(id => !confirmedIds.has(id))) throw new AppError('BILL_AUTOMATION_SAVE_UNCONFIRMED');
  } catch (error: unknown) {
    const normalized = normalizeError(error, 'BILL_SETTING_FAILED');
    if (writeAttempted && ['BILL_SETTING_FAILED', 'NETWORK_ERROR'].includes(normalized.code)) {
      throw new AppError('BILL_AUTOMATION_SAVE_UNCONFIRMED', normalized);
    }
    throw normalized;
  }
}
