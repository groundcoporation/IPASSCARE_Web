import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import type { AttendanceSource } from '../types';
type Dependencies = { client: Pick<SupabaseClient, 'rpc'> };
const isUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function validate(childId: string, packageId: string, date: string) {
  if (!isUuid(childId) || !isUuid(packageId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new AppError('INPUT_INVALID');
}
function writeError(error: unknown) {
  const normalized = normalizeError(error, 'ATT_LEDGER_WRITE_UNCONFIRMED');
  return normalized.code === 'SERVER_UPDATE_REQUIRED' ? new AppError('ATT_UPDATE_REQUIRED', normalized) : normalized;
}
/** Existing atomic server RPC; never retry or use direct table writes as a fallback. */
export async function registerLedgerAttendance(childId: string, date: string, packageId: string, { client }: Dependencies): Promise<{ alreadyRegistered: boolean }> {
  try {
    validate(childId, packageId, date);
    const { data, error } = await client.rpc('register_manual_ledger_attendance', { p_child_id: childId, p_date: date, p_package_id: packageId });
    if (error) throw error;
    if (data?.status !== 'registered' && data?.status !== 'already_registered') throw new AppError('ATT_LEDGER_WRITE_UNCONFIRMED');
    return { alreadyRegistered: data.status === 'already_registered' };
  } catch (error: unknown) { throw writeError(error); }
}

export async function cancelLedgerAttendance(childId: string, date: string, packageId: string, source: AttendanceSource | null, { client }: Dependencies): Promise<{ restored: number }> {
  try {
    validate(childId, packageId, date);
    if (source && (!isUuid(source.id) || (source.consumedAt !== null && !Number.isFinite(Date.parse(source.consumedAt))))) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.rpc('cancel_attendance_ledger_entry', {
      p_child_id: childId, p_date: date, p_package_id: packageId,
      p_usage_id: source?.id ?? null, p_expected_consumed_at: source?.consumedAt ?? null,
    });
    if (error) throw error;
    if (data?.cancelled === false) throw new AppError('CONFLICT_ERROR');
    if (data?.cancelled !== true || !Number.isInteger(data.restored) || data.restored < 0) throw new AppError('ATT_LEDGER_WRITE_UNCONFIRMED');
    return { restored: data.restored };
  } catch (error: unknown) { throw writeError(error); }
}
