import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectPayments() {
  console.log("Checking payments table columns...");
  const { data, error } = await supabase.from('payments').select('*').limit(1);
  if (!error) {
    console.log("Payments table keys:", Object.keys(data[0] || {}));
    if (data.length > 0) {
      console.log("Sample payment:", data[0]);
    }
  } else {
    console.log("Error querying payments table:", error.message);
  }
}

inspectPayments();
