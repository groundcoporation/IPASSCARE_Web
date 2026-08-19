import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectSchedulesSchema() {
  console.log("Checking class schedule table...");
  const { data, error } = await supabase.from('class_schedules').select('*').limit(1);
  if (error) {
    console.log("class_schedules error:", error.message);
    // Let's check other tables
    const { data: test, error: testErr } = await supabase.from('schedules').select('*').limit(1);
    if (!testErr) {
      console.log("Table is called 'schedules'! Keys:", Object.keys(test[0] || {}));
    } else {
      console.log("schedules error:", testErr.message);
    }
  } else {
    console.log("Table is called 'class_schedules'! Keys:", Object.keys(data[0] || {}));
  }
}

inspectSchedulesSchema();
