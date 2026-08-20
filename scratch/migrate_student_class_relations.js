import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function migrateClassRelations() {
  console.log("Starting class relation migration based on target_class matching...");

  // 1. Fetch all academy_students
  const { data: students, error: sErr } = await supabase
    .from('academy_students')
    .select('id, child_id, branch_id');

  if (sErr || !students) {
    console.error("Error fetching students:", sErr?.message);
    return;
  }

  // 2. Fetch children target_class strings
  const { data: children, error: cErr } = await supabase
    .from('children')
    .select('id, target_class');

  if (cErr || !children) {
    console.error("Error fetching children:", cErr?.message);
    return;
  }

  const childMap = new Map(children.map(c => [c.id, c.target_class]));

  // 3. Fetch all class_schedules
  const { data: classSchedules, error: clErr } = await supabase
    .from('class_schedules')
    .select('id, target_class, branch_id');

  if (clErr || !classSchedules) {
    console.error("Error fetching class schedules:", clErr?.message);
    return;
  }

  // 4. Fetch first available package option for each branch to use as default pricing
  const { data: packageOptions } = await supabase
    .from('package_options')
    .select('id, branch_id');

  const defaultPkgMap = new Map();
  packageOptions?.forEach(p => {
    if (!defaultPkgMap.has(p.branch_id)) {
      defaultPkgMap.set(p.branch_id, p.id);
    }
  });

  let mappedCount = 0;
  
  for (const student of students) {
    if (!student.child_id) continue;

    const childTargetClass = childMap.get(student.child_id);
    if (!childTargetClass) continue;

    // Find class schedules that match by substring (e.g. childTargetClass contains schedule.target_class)
    const matchingSchedules = classSchedules.filter(sched => {
      // Must belong to the same branch
      if (sched.branch_id !== student.branch_id) return false;
      
      const cleanSchedName = sched.target_class.trim();
      if (!cleanSchedName || cleanSchedName === '개설가능' || cleanSchedName === '개설 가능') return false;

      return childTargetClass.includes(cleanSchedName);
    });

    if (matchingSchedules.length > 0) {
      // Find default package option for pricing
      const defaultPkgId = defaultPkgMap.get(student.branch_id) || null;

      for (const sched of matchingSchedules) {
        // Check if mapping already exists
        const { data: existing } = await supabase
          .from('academy_student_classes')
          .select('id')
          .eq('student_id', student.id)
          .eq('class_schedule_id', sched.id)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Insert mapping
        const { error: insErr } = await supabase
          .from('academy_student_classes')
          .insert([{
            student_id: student.id,
            class_schedule_id: sched.id,
            package_option_id: defaultPkgId,
            billing_cycle: '월 기간제',
            payment_day: '매월 1일',
            status: 'active'
          }]);

        if (insErr) {
          console.error(`Failed to map student ${student.id} to class ${sched.target_class}:`, insErr.message);
        } else {
          mappedCount++;
        }
      }
    }
  }

  console.log(`Class relation migration finished. Created ${mappedCount} student-class mapping rows.`);
}

migrateClassRelations();
