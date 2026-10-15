// Percent has 2 decimals. A batch discount is calculated from its total first.
export function normalizeDiscountPercent(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value)) * 100) / 100 : 0;
}

export function discountedBillAmount(amount: number, percent: number): number {
  const basisPoints = Math.round(normalizeDiscountPercent(percent) * 100);
  return Math.max(0, Math.floor(amount * (10000 - basisPoints) / 10000));
}

/**
 * Applies a percentage discount once to the total and then distributes that
 * exact payable total across item bills. Largest remainders receive the
 * leftover won so the returned amounts always add up to the total payable.
 */
export function allocateDiscountedBillAmounts(amounts: number[], percent: number): number[] {
  const normalized = amounts.map((amount) => Math.max(0, Math.floor(Number(amount) || 0)));
  const total = normalized.reduce((sum, amount) => sum + amount, 0);
  if (total === 0) return normalized.map(() => 0);

  const payableTotal = discountedBillAmount(total, percent);
  const provisional = normalized.map((amount, index) => {
    const exact = amount * payableTotal / total;
    const roundedDown = Math.floor(exact);
    return { index, amount: roundedDown, remainder: exact - roundedDown };
  });
  let remainingWon = payableTotal - provisional.reduce((sum, item) => sum + item.amount, 0);

  provisional
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .forEach((item) => {
      if (remainingWon > 0) {
        item.amount += 1;
        remainingWon -= 1;
      }
    });

  return provisional
    .sort((left, right) => left.index - right.index)
    .map((item) => item.amount);
}
