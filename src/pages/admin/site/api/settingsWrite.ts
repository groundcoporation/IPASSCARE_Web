import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { prepareSiteSettings } from '../model/settings.ts';
/** One singleton upsert. No retry or alternate write on error/unknown response. */
export async function saveAdminSiteSettings(litePrice: string, proPrice: string, { client, now = () => new Date().toISOString() }: {
  client: Pick<SupabaseClient, 'from'>; now?: () => string;
}) {
  const prices = prepareSiteSettings(litePrice, proPrice);
  try {
    const { data, error } = await client.from('web_settings').upsert({ id: 'default', lite_monthly_price: prices.litePrice,
      pro_monthly_price: prices.proPrice, updated_at: now(),
    }).select('id,lite_monthly_price,pro_monthly_price').single();
    if (error) throw error;
    if (!data || data.id !== 'default') throw new AppError('ADMIN_SETTINGS_SAVE_UNCONFIRMED');
    const returnedPrice = (value: unknown) => (typeof value === 'number' || typeof value === 'string')
      && /^\d+(?:\.0+)?$/.test(String(value).trim()) ? Number(value) : NaN;
    if (returnedPrice(data.lite_monthly_price) !== prices.litePrice || returnedPrice(data.pro_monthly_price) !== prices.proPrice) throw new AppError('ADMIN_SETTINGS_SAVE_UNCONFIRMED');
    return prices;
  } catch (error: unknown) { throw normalizeError(error, 'ADMIN_SETTINGS_SAVE_UNCONFIRMED'); }
}
