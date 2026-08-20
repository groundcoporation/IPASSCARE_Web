import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectClassesAndChildren() {
  console.log("Fetching class schedules...");
  const { data: schedules } = await supabase.from('class_schedules').select('id, target_class');
  console.log("Class schedules:", schedules);

  console.log("Fetching children sample target_class values...");
  const { data: children } = await supabase.from('children').select('child_name, target_class').limit(15);
  children?.forEach(c => {
    console.log(`Child: ${c.child_name} | target_class: "${c.target_class}"`);
  });
}

inspectClassesAndChildren();
