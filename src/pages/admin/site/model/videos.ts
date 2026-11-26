import { AppError } from '../../../../errors/appError.ts';
export interface VideoForm {
  title: string; category: string; duration: string; description: string; stepsText: string;
  url: string; theme: string; restricted: boolean;
}
// Preserve the old ID-extraction rule; this is not a hostname/URL security validator.
export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/);
  return match && match[2].length === 11 ? match[2] : null;
}
export const videoSteps = (text: string) => text.split('\n').map(step => step.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean);
export const videoDuration = (duration: string, youtubeId: string | null) => duration.trim() || (youtubeId ? '유튜브 자동 감지됨' : '2분 분량');
export const isVideoId = (id: string) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export function prepareVideo(form: VideoForm) {
  const labels: Record<string, string> = { parent: '학부모 매뉴얼', admin: '학원장 매뉴얼', driver: '기사님 매뉴얼' };
  if (!form.title.trim() || form.title.trim().length > 150 || !form.url.trim() || !Object.hasOwn(labels, form.category)) throw new AppError('ADMIN_VIDEO_INPUT_INVALID');
  const youtubeId = extractYoutubeId(form.url);
  return { title: form.title.trim(), category: form.category, category_label: labels[form.category],
    duration: videoDuration(form.duration, youtubeId), description: form.description.trim() || null,
    steps: videoSteps(form.stepsText), youtube_url: form.url.trim(), youtube_id: youtubeId,
    thumbnail_bg: form.theme, is_restricted: form.restricted, access_level: form.restricted ? 'staff' : 'public', is_visible: true };
}
