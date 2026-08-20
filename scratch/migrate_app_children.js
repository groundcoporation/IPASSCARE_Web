import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function migrateAppChildren() {
  console.log("Fetching children and users for remaining migration...");
  
  // 1. Fetch children
  const { data: children, error: cErr } = await supabase
    .from('children')
    .select(`
      id,
      parent_id,
      child_name,
      child_birth,
      created_at,
      child_phone,
      branch_id
    `);

  if (cErr) {
    console.error("Error fetching children:", cErr.message);
    return;
  }

  // 2. Fetch users
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, name, phone');

  if (uErr) {
    console.error("Error fetching users:", uErr.message);
    return;
  }

  const userMap = new Map(users.map(u => [u.id, u]));

  let inserted = 0;
  let skipped = 0;

  for (const c of children) {
    // Check if already exists in academy_students
    const { data: existing } = await supabase
      .from('academy_students')
      .select('id')
      .eq('child_id', c.id)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const parent = userMap.get(c.parent_id);
    const parentPhone = parent?.phone || '';
    const cleanPhone = parentPhone.replace(/[^0-9]/g, '');
    const attendanceCode = cleanPhone ? cleanPhone.slice(-4) : '0000';

    // Safe birth date parsing
    let birthDate = null;
    if (c.child_birth && c.child_birth.length === 8) {
      const y = parseInt(c.child_birth.slice(0, 4));
      const m = parseInt(c.child_birth.slice(4, 6));
      const d = parseInt(c.child_birth.slice(6, 8));
      
      // Validate date ranges
      if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        birthDate = `${c.child_birth.slice(0, 4)}-${c.child_birth.slice(4, 6)}-${c.child_birth.slice(6, 8)}`;
      }
    }

    const student = {
      parent_user_id: c.parent_id,
      child_id: c.id,
      branch_id: c.branch_id || 'branch_1',
      student_name: c.child_name,
      attendance_code: attendanceCode || '0000',
      mother_phone: parentPhone || null,
      student_phone: c.child_phone || null,
      birth_date: birthDate,
      admission_date: c.created_at ? c.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      is_sms_enabled: true
    };

    const { error: insErr } = await supabase
      .from('academy_students')
      .insert([student]);

    if (insErr) {
      console.error(`Failed to insert ${student.student_name}:`, insErr.message);
    } else {
      inserted++;
    }
  }

  console.log(`Remaining Migration finished. Inserted: ${inserted}, Skipped/Exists: ${skipped}`);
}

migrateAppChildren();
