import { AppError } from '../../../../errors/appError.ts';
export interface ClassForm { branchId: string; title: string; teacherId: string; day: string; start: string; end: string; capacity: string }
export const isClassId = (id: string) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export function prepareClassWrite(form: ClassForm) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!form.branchId || form.branchId === 'all' || !form.title.trim() || (form.teacherId && !isClassId(form.teacherId))
    || !['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'].includes(form.day)
    || !time.test(form.start) || !time.test(form.end) || form.end <= form.start) throw new AppError('CLASS_WRITE_INPUT_INVALID');
  const capacity = form.capacity.trim();
  if (capacity && (!/^\d+$/.test(capacity) || !Number.isInteger(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 2147483647)) throw new AppError('CLASS_WRITE_INPUT_INVALID');
  return { branch_id: form.branchId, target_class: form.title.trim(), teacher_id: form.teacherId || null, day_of_week: form.day,
    start_time: form.start + ':00', end_time: form.end + ':00', max_people: capacity ? Number(capacity) : null, is_active: true };
}
