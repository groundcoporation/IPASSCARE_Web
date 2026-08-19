import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectSchema() {
  console.log("Querying database tables list via public RPC / metadata...");
  // In Supabase/PostgREST, we can get list of tables by querying the schema cache or throwing a dummy error
  const { data, error } = await supabase.from('non_existent_table_name_to_get_schema_error').select('*');
  console.log("Dummy error:", error ? error.message : "No error");

  // Let's test if there is an rpc function we can query
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_tables');
  console.log("rpc get_tables:", rpcError ? rpcError.message : rpcData);
}

inspectSchema();
