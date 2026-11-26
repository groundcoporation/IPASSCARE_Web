import type { BillingTargetStudent } from '../types';

const normalizedBillingLabel = (value: string) => value.replace(/[\s·._-]+/g, '').toLowerCase();
export const billingCommercialIdentity = (value: { voucherType?: string | null; optionLabel?: string; label?: string; price?: number }) => [
  (value.voucherType || 'lesson').toLowerCase(),
  normalizedBillingLabel(value.optionLabel || value.label || ''),
  Number(value.price || 0),
].join(':');

export const standardOptionIdsForStudent = (student: BillingTargetStudent) => Array.from(new Set(
  student.packages
    .filter(item => !item.isAdditional && item.optionId && item.userPackageId.startsWith('plan:'))
    .map(item => item.optionId as string),
));
export const allOptionIdsForStudent = (student: BillingTargetStudent) => new Set(
  student.packages.map(item => item.optionId).filter(Boolean) as string[],
);
