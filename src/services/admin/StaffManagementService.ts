import { supabase } from '../../lib/supabaseClient';
import { AppError, normalizeError } from '../../errors/appError';

export interface StaffSaveInput {
  id: string | null;
  source?: 'user' | 'custom';
  branchId: string;
  name: string;
  phone: string;
  email: string;
  memo: string;
  role: string;
}

export async function loadStaffRecords(branchId: string | null) {
  try {
    let users = supabase.from('users').select('id,name,phone,email,role,branch_id,created_at')
      .in('role', ['director', 'teacher', 'coach', 'driver']);
    let teachers = supabase.from('academy_teachers').select('*');
    if (branchId) { users = users.eq('branch_id', branchId); teachers = teachers.eq('branch_id', branchId); }
    const [members, manual] = await Promise.all([users, teachers]);
    if (members.error) throw members.error;
    if (manual.error) throw manual.error;
    return { members: members.data ?? [], manual: manual.data ?? [] };
  } catch (error: unknown) { throw normalizeError(error, 'STAFF_LOAD_FAILED'); }
}

async function updateStaffRole(id: string, role: string) {
  const { data, error } = await supabase.rpc('update_member_role', { p_user_id: id, p_role: role });
  if (error) throw error;
  if (data?.user_id !== id || data?.role !== role) throw new AppError('CONFLICT_ERROR');
}

export async function saveStaffMember(input: StaffSaveInput) {
  try {
    if (input.id && input.source === 'user') {
      await updateStaffRole(input.id, input.role);
      return;
    }
    if (input.id && input.source !== 'custom') throw new AppError('CONFLICT_ERROR');
    const payload = { branch_id: input.branchId, name: input.name.trim(),
      phone: input.phone.trim() || null, email: input.email.trim() || null, memo: input.memo.trim() || null };
    const query = input.id
      ? supabase.from('academy_teachers').update(payload).eq('id', input.id)
      : supabase.from('academy_teachers').insert(payload);
    const { data, error } = await query.select('id').single();
    if (error) throw error;
    if (!data?.id || (input.id && data.id !== input.id)) throw new AppError('CONFLICT_ERROR');
  } catch (error: unknown) { throw normalizeError(error, 'STAFF_SAVE_FAILED'); }
}

export async function removeStaffMember(id: string, source: 'user' | 'custom') {
  try {
    if (source === 'user') {
      // Do not fall back to a direct users update if this RPC is unavailable/denied.
      await updateStaffRole(id, 'user');
      return;
    }
    const { data, error } = await supabase.from('academy_teachers').delete().eq('id', id).select('id').single();
    if (error) throw error;
    if (data?.id !== id) throw new AppError('CONFLICT_ERROR');
  } catch (error: unknown) { throw normalizeError(error, 'STAFF_REMOVE_FAILED'); }
}
