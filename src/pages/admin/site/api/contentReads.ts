import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';

export type AdminContentList = 'inquiries' | 'videos' | 'partners';
const lists = {
  inquiries: { table: 'web_inquiries', order: 'created_at', ascending: false },
  videos: { table: 'web_manual_videos', order: 'created_at', ascending: false },
  partners: { table: 'web_partner_logos', order: 'display_order', ascending: true },
} as const;
type Client = Pick<SupabaseClient, 'from'>;

/** Admin-only UI entry points must check profile; actual authorization remains server RLS. */
export async function loadAdminContentList(kind: AdminContentList, { client }: { client: Client }): Promise<Record<string, unknown>[]> {
  try {
    if (!Object.hasOwn(lists, kind)) throw new AppError('INPUT_INVALID');
    const spec = lists[kind];
    const { data, error } = await client.from(spec.table).select('*').order(spec.order, { ascending: spec.ascending });
    if (error) throw error;
    if (!Array.isArray(data) || data.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new AppError('ADMIN_CONTENT_LOAD_FAILED');
    return data;
  } catch (error: unknown) { throw normalizeError(error, 'ADMIN_CONTENT_LOAD_FAILED'); }
}

export async function loadAdminSiteSettings({ client }: { client: Client }) {
  try {
    const { data, error } = await client.from('web_settings').select('*').eq('id', 'default').maybeSingle();
    if (error) throw error;
    if (data !== null && (!data || typeof data !== 'object' || Array.isArray(data))) throw new AppError('ADMIN_CONTENT_LOAD_FAILED');
    for (const value of [data?.lite_monthly_price, data?.pro_monthly_price]) {
      if (value != null && typeof value !== 'number' && typeof value !== 'string') throw new AppError('ADMIN_CONTENT_LOAD_FAILED');
    }
    // Retain legacy display defaults and zero/falsy fallback, not a pricing policy migration.
    return { litePrice: String(data?.lite_monthly_price || 99000), proPrice: String(data?.pro_monthly_price || 118000) };
  } catch (error: unknown) { throw normalizeError(error, 'ADMIN_CONTENT_LOAD_FAILED'); }
}
