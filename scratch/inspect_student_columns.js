import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectStudentColumns() {
  console.log("Checking academy_students columns...");
  const { data, error } = await supabase.from('academy_students').select('*').limit(1);
  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("academy_students columns:", Object.keys(data[0] || {}));
    if (data.length > 0) {
      console.log("Sample student:", data[0]);
    }
  }
}

inspectStudentColumns();
