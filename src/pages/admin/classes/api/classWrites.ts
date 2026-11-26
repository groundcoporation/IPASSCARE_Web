import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { prepareClassWrite, isClassId, type ClassForm } from '../model/classWrite.ts';
type Client = Pick<SupabaseClient, 'from'>;
export async function saveClassRecord(form: ClassForm, target: { id: string; branchId: string | null } | null, { client }: { client: Client }) {
  try {
    if (target && !isClassId(target.id)) throw new AppError('CLASS_WRITE_INPUT_INVALID');
    const values = prepareClassWrite(form);
    let query;
    if (target) {
      query = client.from('class_schedules').update(values).eq('id', target.id);
      query = target.branchId === null ? query.is('branch_id', null) : query.eq('branch_id', target.branchId);
    } else query = client.from('class_schedules').insert([values]);
    const { data, error } = await query.select('id,branch_id,target_class,teacher_id,day_of_week,start_time,end_time,max_people,is_active').single();
    if (error) throw error;
    if (!data || !isClassId(data.id ?? '') || (target && data.id !== target.id)
      || Object.entries(values).some(([key, value]) => data[key as keyof typeof values] !== value)) throw new AppError('CLASS_WRITE_UNCONFIRMED');
    return { id: data.id as string };
  } catch (error: unknown) { throw normalizeError(error, 'CLASS_WRITE_UNCONFIRMED'); }
}
/** Existing hard-delete semantics retained. Dependent-row/cascade policy is NOT verified here. */
export async function deleteClassRecord(target: { id: string; branchId: string | null }, { client }: { client: Client }) {
  try {
    if (!isClassId(target.id)) throw new AppError('CLASS_WRITE_INPUT_INVALID');
    let query = client.from('class_schedules').delete().eq('id', target.id);
    query = target.branchId === null ? query.is('branch_id', null) : query.eq('branch_id', target.branchId);
    const { data, error } = await query.select('id').single();
    if (error) throw error;
    if (!data || data.id !== target.id) throw new AppError('CLASS_WRITE_UNCONFIRMED');
  } catch (error: unknown) { throw normalizeError(error, 'CLASS_WRITE_UNCONFIRMED'); }
}
