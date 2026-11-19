import { createClient } from '@supabase/supabase-js';
import { environmentConfig } from './environment';
import { createPreviewSupabaseFetch } from '../../config/preview-network.mjs';

const previewOptions = environmentConfig.environment === 'preview' ? {
  global: {
    fetch: createPreviewSupabaseFetch(globalThis.fetch.bind(globalThis), environmentConfig.supabaseUrl,
      () => Response.json({ code: 'PREVIEW_EXTERNAL_DISABLED' }, { status: 403 })),
  },
} : undefined;
export const supabase = createClient(environmentConfig.supabaseUrl, environmentConfig.supabaseAnonKey, previewOptions);
