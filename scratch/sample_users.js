import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function sampleUsers() {
  console.log("Fetching sample users with referral info...");
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, points, referred_by, referral_count, level, lineage')
    .limit(10);
    
  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("Sample users:", JSON.stringify(users, null, 2));
  }

  console.log("Fetching sample point_logs...");
  const { data: logs, error: logsError } = await supabase
    .from('point_logs')
    .select('*')
    .limit(5);
    
  if (logsError) {
    console.log("logs error:", logsError.message);
  } else {
    console.log("Sample logs:", JSON.stringify(logs, null, 2));
  }
}

sampleUsers();
