import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function listTables() {
  console.log("Checking if web_partner_logos or similar table exists...");
  const { data, error } = await supabase.from('web_partner_logos').select('*').limit(1);
  if (error) {
    console.log("web_partner_logos table does not exist or error:", error.message);
  } else {
    console.log("web_partner_logos table exists! Data sample:", data);
  }

  const { data: settings, error: settingsError } = await supabase.from('web_settings').select('*').eq('id', 'default').maybeSingle();
  if (settingsError) {
    console.log("web_settings error:", settingsError.message);
  } else {
    console.log("web_settings columns:", Object.keys(settings || {}));
  }
}

listTables();
