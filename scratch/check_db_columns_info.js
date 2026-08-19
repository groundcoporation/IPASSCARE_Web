import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkColumns() {
  console.log("Checking actual database columns via RPC or direct query...");
  // Let's run a test query to insert/select with columns
  const { data: sCols, error: sErr } = await supabase
    .from('academy_student_classes')
    .select('id, student_id, class_schedule_id, package_option_id, billing_cycle, payment_day')
    .limit(1);

  if (sErr) {
    console.log("Error querying columns from academy_student_classes:", sErr.message);
  } else {
    console.log("Success! Columns exist in academy_student_classes.");
  }
}

checkColumns();
