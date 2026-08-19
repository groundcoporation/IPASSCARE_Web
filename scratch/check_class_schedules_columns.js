import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectColumns() {
  console.log("Checking columns of class_schedules table...");
  const { data: cData, error: cErr } = await supabase.from('class_schedules').select('*').limit(1);
  if (cErr) {
    console.log("Error querying class_schedules:", cErr.message);
  } else {
    console.log("class_schedules keys:", Object.keys(cData[0] || {}));
  }

  console.log("Checking columns of academy_student_classes table...");
  const { data: sData, error: sErr } = await supabase.from('academy_student_classes').select('*').limit(1);
  if (sErr) {
    console.log("Error querying academy_student_classes:", sErr.message);
  } else {
    console.log("academy_student_classes keys:", Object.keys(sData[0] || {}));
  }
}

inspectColumns();
