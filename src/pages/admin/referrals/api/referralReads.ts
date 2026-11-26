import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
export interface UserRecord {
  id: string; username: string | null; email: string | null; name: string | null; phone: string | null; role: string | null;
  target_class: string | null; points: number | null; referred_by: string | null; referral_count: number | null;
  level: number | null; lineage: string[] | null; created_at: string;
}
export interface PointLog { id: string; amount: number; reason: string; type: string; created_at: string }
type Client = Pick<SupabaseClient, 'from'>;
export async function loadReferralUsers({ client }: { client: Client }): Promise<UserRecord[]> {
  try {
    const { data, error } = await client.from('users').select('id, username, email, name, phone, role, target_class, points, referred_by, referral_count, level, lineage, created_at').neq('status', 'deleted');
    if (error) throw error;
    if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' || (row.lineage != null && (!Array.isArray(row.lineage) || row.lineage.some((id: unknown) => typeof id !== 'string'))))) throw new AppError('REFERRAL_LOAD_FAILED');
    return data;
  } catch (error: unknown) { throw normalizeError(error, 'REFERRAL_LOAD_FAILED'); }
}
export async function loadReferralPoints(userId: string, { client }: { client: Client }): Promise<PointLog[]> {
  try {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId)) throw new AppError('INPUT_INVALID');
    const { data, error } = await client.from('point_logs').select('id, amount, reason, type, created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' || typeof row.amount !== 'number')) throw new AppError('REFERRAL_LOAD_FAILED');
    return data;
  } catch (error: unknown) { throw normalizeError(error, 'REFERRAL_LOAD_FAILED'); }
}
