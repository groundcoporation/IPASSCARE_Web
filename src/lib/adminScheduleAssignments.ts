import { supabase } from './supabaseClient';

export interface ActiveAppSchedule {
  id: string;
  target_class: string;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
}

export const loadActiveAppSchedulesByChild = async (childIds: string[]) => {
  const uniqueChildIds = Array.from(new Set(childIds.filter(Boolean)));
  const schedulesByChild = new Map<string, ActiveAppSchedule[]>();
  uniqueChildIds.forEach((childId) => schedulesByChild.set(childId, []));
  if (uniqueChildIds.length === 0) return schedulesByChild;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('student_schedule_assignments')
    .select(`
      child_id,
      schedule_id,
      class_schedules:schedule_id(
        id,
        target_class,
        day_of_week,
        start_time,
        end_time
      )
    `)
    .eq('is_active', true)
    .lte('starts_on', today)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .in('child_id', uniqueChildIds);

  if (error) throw error;
  (data as any[] || []).forEach((assignment) => {
    const schedule = assignment.class_schedules;
    if (!assignment.child_id || !schedule) return;
    const current = schedulesByChild.get(assignment.child_id) || [];
    if (!current.some((item) => item.id === schedule.id)) current.push(schedule);
    schedulesByChild.set(assignment.child_id, current);
  });

  return schedulesByChild;
};
