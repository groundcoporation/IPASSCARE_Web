import { AppError } from '../../../../errors/appError.ts';
export interface PartnerForm { name: string; description: string; logoUrl: string; order: string; visible: boolean; file: File | null }
const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif' };
export const isPartnerId = (id: string) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
export function partnerFileExtension(file: File) {
  const extension = Object.hasOwn(extensions, file.type) ? extensions[file.type] : null;
  if (!extension || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new AppError('ADMIN_PARTNER_INPUT_INVALID');
  return extension;
}
export function preparePartner(form: PartnerForm) {
  const order = form.order.trim() || '0';
  if (!form.name.trim() || !/^-?\d+$/.test(order) || !Number.isInteger(Number(order)) || Number(order) < -2147483648 || Number(order) > 2147483647) throw new AppError('ADMIN_PARTNER_INPUT_INVALID');
  if (form.file) partnerFileExtension(form.file);
  else {
    try { const url = new URL(form.logoUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); }
    catch (error: unknown) { throw new AppError('ADMIN_PARTNER_INPUT_INVALID', error); }
  }
  return { name: form.name.trim(), description: form.description.trim() || null, logo_url: form.logoUrl,
    display_order: Number(order), is_visible: form.visible };
}
