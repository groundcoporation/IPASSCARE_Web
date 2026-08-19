import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testTreeQuery() {
  // Let's take a known user who has referred others or is in a lineage.
  // From previous logs, "0f323c1f-95b8-438f-b9b6-130d79840d9f" is an ancestor in several users' lineage.
  const parentId = "0f323c1f-95b8-438f-b9b6-130d79840d9f";

  console.log(`Querying downline for ancestor ID: ${parentId}`);
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, referred_by, level, lineage')
    .contains('lineage', [parentId]);
    
  if (error) {
    console.log("Query error:", error.message);
  } else {
    console.log(`Successfully fetched ${data.length} downline users!`);
    console.log("Sample downline:", data.slice(0, 3));
  }
}

testTreeQuery();
