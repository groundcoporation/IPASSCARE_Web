import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wsdyrercgbvwlssntwvy.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZHlyZXJjZ2J2d2xzc250d3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjMxMTEsImV4cCI6MjA5MjkzOTExMX0.G2fx3ZJwdqGzKavoQbaikcZ3Qc4BM3zjpkncqXxU0QY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
