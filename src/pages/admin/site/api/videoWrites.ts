import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, normalizeError } from '../../../../errors/appError.ts';
import { prepareVideo, isVideoId, type VideoForm } from '../model/videos.ts';
type Client = Pick<SupabaseClient, 'from'>;
export async function saveAdminVideo(form: VideoForm, id: string | null, { client }: { client: Client }) {
  try {
    if (id !== null && !isVideoId(id)) throw new AppError('ADMIN_VIDEO_INPUT_INVALID');
    const values = prepareVideo(form);
    const query = id ? client.from('web_manual_videos').update(values).eq('id', id)
      : client.from('web_manual_videos').insert([{ ...values, display_order: 0 }]);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    if (!data || !isVideoId(data.id ?? '') || (id !== null && data.id !== id)
      || Object.entries(values).some(([key, value]) => key === 'steps'
        ? !Array.isArray(data.steps) || JSON.stringify(data.steps) !== JSON.stringify(value)
        : data[key] !== value)) throw new AppError('ADMIN_VIDEO_WRITE_UNCONFIRMED');
    return { id: data.id as string };
  } catch (error: unknown) { throw normalizeError(error, 'ADMIN_VIDEO_WRITE_UNCONFIRMED'); }
}
export async function deleteAdminVideo(id: string, { client }: { client: Client }) {
  try {
    if (!isVideoId(id)) throw new AppError('ADMIN_VIDEO_INPUT_INVALID');
    const { data, error } = await client.from('web_manual_videos').delete().eq('id', id).select('id').single();
    if (error) throw error;
    if (!data || data.id !== id) throw new AppError('ADMIN_VIDEO_WRITE_UNCONFIRMED');
  } catch (error: unknown) { throw normalizeError(error, 'ADMIN_VIDEO_WRITE_UNCONFIRMED'); }
}
