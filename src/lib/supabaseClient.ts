import { createClient } from '@supabase/supabase-js';
import { environmentConfig } from './environment';

export const supabase = createClient(environmentConfig.supabaseUrl, environmentConfig.supabaseAnonKey);
