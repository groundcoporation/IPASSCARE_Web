// KRW: truncate per invoice, not after summing invoices. Percent has 2 decimals.
export function normalizeDiscountPercent(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value)) * 100) / 100 : 0;
}

export function discountedBillAmount(amount: number, percent: number): number {
  const basisPoints = Math.round(normalizeDiscountPercent(percent) * 100);
  return Math.max(0, Math.floor(amount * (10000 - basisPoints) / 10000));
}
