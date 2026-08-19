import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectPackages() {
  console.log("Checking package-related tables...");
  
  // Let's check table list by querying a few potential names
  const potentialTables = ['packages', 'products', 'user_packages', 'payment_products', 'branches'];
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
}

inspectPackages();
