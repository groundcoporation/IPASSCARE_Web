import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectPaymentsColumns() {
  console.log("Querying database columns for 'payments' table...");
  const { data, error } = await supabase.from('payments').select('id, created_at, status, total_amount, final_amount, payment_method, pg_tid, user_id').limit(1);
  if (error) {
    console.log("Error querying specific columns:", error.message);
  } else {
    console.log("Success! Columns exist. Row:", data[0] || "empty");
  }
}

inspectPaymentsColumns();
