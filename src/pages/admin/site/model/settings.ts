import { AppError } from '../../../../errors/appError.ts';
function price(value: string) {
  // Zero reads as the legacy fallback: block until a zero-price policy is defined.
  const text = value.trim(); const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number <= 0) throw new AppError('ADMIN_SETTINGS_INPUT_INVALID');
  return number;
}
export function prepareSiteSettings(litePrice: string, proPrice: string) {
  return { litePrice: price(litePrice), proPrice: price(proPrice) };
}
