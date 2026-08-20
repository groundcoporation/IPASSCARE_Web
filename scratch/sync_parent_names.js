import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function syncParentNames() {
  console.log("Synchronizing parent names from users to academy_students...");

  // 1. Fetch all academy_students who have a parent_user_id and no parent_name
  const { data: students, error: sErr } = await supabase
    .from('academy_students')
    .select('id, parent_user_id, parent_name');

  if (sErr || !students) {
    console.error("Error fetching students:", sErr?.message);
    return;
  }

  // 2. Fetch users
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, name');

  if (uErr || !users) {
    console.error("Error fetching users:", uErr?.message);
    return;
  }

  const userMap = new Map(users.map(u => [u.id, u.name]));
  let updatedCount = 0;

  for (const student of students) {
    if (!student.parent_user_id) continue;
    
    // Only update if parent_name is currently empty/null
    if (!student.parent_name) {
      const actualName = userMap.get(student.parent_user_id);
      if (actualName) {
        const { error: updErr } = await supabase
          .from('academy_students')
          .update({ parent_name: actualName })
          .eq('id', student.id);

        if (updErr) {
          console.error(`Failed to update parent name for student ${student.id}:`, updErr.message);
        } else {
          updatedCount++;
        }
      }
    }
  }

  console.log(`Synchronization finished. Updated ${updatedCount} students' parent_name field.`);
}

syncParentNames();
