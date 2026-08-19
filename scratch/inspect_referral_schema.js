import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectReferralSchema() {
  console.log("Inspecting 'users' table columns...");
  // Fetch a single row to see columns
  const { data: users, error: usersError } = await supabase.from('users').select('*').limit(1);
  if (usersError) {
    console.log("users table error:", usersError.message);
  } else {
    console.log("users table sample keys:", Object.keys(users[0] || {}));
  }

  // Let's check if there's a table for referrals, points, or points logs
  // We can query PostgREST public schema to guess table existence by trying to fetch
  const testTables = ['referrals', 'referral_logs', 'points', 'point_logs', 'user_points', 'recommenders'];
  for (const table of testTables) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (!error) {
      console.log(`Table '${table}' exists in the database!`);
    } else {
      if (!error.message.includes('Could not find the table')) {
        console.log(`Table '${table}' exists but query failed:`, error.message);
      }
    }
  }
}

inspectReferralSchema();
