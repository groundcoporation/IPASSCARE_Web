import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { preparePartner, partnerFileExtension, isPartnerId, type PartnerForm } from '../model/partners.ts';
type Client = Pick<SupabaseClient, 'from' | 'storage'>;
/** Storage and row writes are not atomic. Never remove an old or unconfirmed uploaded file. */
export async function saveAdminPartner(form: PartnerForm, id: string | null, { client, uuid = () => crypto.randomUUID() }: { client: Client; uuid?: () => string }) {
  let stage: 'not_started' | 'upload_unconfirmed' | 'uploaded' | 'row_unconfirmed' | 'confirmed' = 'not_started';
  let uploadedPath: string | null = null;
  try {
    if (id !== null && !isPartnerId(id)) throw new AppError('ADMIN_PARTNER_INPUT_INVALID');
    const values = preparePartner(form);
    if (form.file) {
      const token = uuid();
      if (!isPartnerId(token)) throw new AppError('ADMIN_PARTNER_INPUT_INVALID');
      uploadedPath = `logos/${token}.${partnerFileExtension(form.file)}`;
      stage = 'upload_unconfirmed';
      const bucket = client.storage.from('web_partner_logos');
      const { data, error } = await bucket.upload(uploadedPath, form.file, { upsert: false });
      if (error) throw error;
      if (!data || data.path !== uploadedPath) throw new AppError('ADMIN_PARTNER_UPLOAD_UNCONFIRMED');
      stage = 'uploaded';
      const publicUrl = bucket.getPublicUrl(uploadedPath).data?.publicUrl;
      try { if (!publicUrl || !['http:', 'https:'].includes(new URL(publicUrl).protocol)) throw new Error(); }
      catch (error: unknown) { throw new AppError('ADMIN_PARTNER_SAVE_PARTIAL', error); }
      values.logo_url = publicUrl;
    }
    stage = 'row_unconfirmed';
    const query = id ? client.from('web_partner_logos').update(values).eq('id', id) : client.from('web_partner_logos').insert([values]);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    if (!data || !isPartnerId(data.id ?? '') || (id && data.id !== id) || Object.entries(values).some(([key, value]) => data[key] !== value)) throw new AppError('ADMIN_PARTNER_WRITE_UNCONFIRMED');
    stage = 'confirmed';
    return { stage, uploadedPath, id: data.id as string, issue: null };
  } catch (error: unknown) {
    const fallback = stage === 'upload_unconfirmed' ? 'ADMIN_PARTNER_UPLOAD_UNCONFIRMED' : uploadedPath ? 'ADMIN_PARTNER_SAVE_PARTIAL' : 'ADMIN_PARTNER_WRITE_UNCONFIRMED';
    return { stage, uploadedPath, id: null, issue: normalizeError(error, fallback) };
  }
}
export async function deleteAdminPartner(id: string, { client }: { client: Pick<SupabaseClient, 'from'> }) {
  try {
    if (!isPartnerId(id)) throw new AppError('ADMIN_PARTNER_INPUT_INVALID');
    const { data, error } = await client.from('web_partner_logos').delete().eq('id', id).select('id').single();
    if (error) throw error;
    if (!data || data.id !== id) throw new AppError('ADMIN_PARTNER_WRITE_UNCONFIRMED');
    // Existing/possibly shared file is deliberately retained; no storage deletion.
  } catch (error: unknown) { throw normalizeError(error, 'ADMIN_PARTNER_WRITE_UNCONFIRMED'); }
}
