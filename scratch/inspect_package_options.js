import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectPackageOptions() {
  console.log("Checking package options...");
  
  // Let's check table list by querying package_options, options
  const potentialTables = ['package_options', 'options'];
  for (const table of potentialTables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (!error) {
      console.log(`Table '${table}' exists! Keys:`, Object.keys(data[0] || {}));
      if (data.length > 0) {
        console.log(`Sample from '${table}':`, data[0]);
      }
    } else {
      if (!error.message.includes('Could not find the table')) {
        console.log(`Table '${table}' query failed:`, error.message);
      }
    }
  }

  // Let's print unique packages and their pricing info if stored in some columns
  const { data: packageSamples, error: pErr } = await supabase.from('packages').select('*').limit(10);
  if (!pErr) {
    console.log("Package samples:", packageSamples.map(p => ({ id: p.id, name: p.name, category: p.category_id })));
  }
}

inspectPackageOptions();
