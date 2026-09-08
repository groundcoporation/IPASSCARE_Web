import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discountedBillAmount, normalizeDiscountPercent } from '../src/utils/billingAmount.ts';

test('fractional KRW is truncated per invoice and preview sums the same amounts', () => {
  const amounts = [101, 103, 107];
  assert.deepEqual(amounts.map(amount => discountedBillAmount(amount, 5)), [95, 97, 101]);
  assert.equal(amounts.reduce((sum, amount) => sum + discountedBillAmount(amount, 5), 0), 293);
});
test('integer basis points avoid floating-point loss at exact won boundaries', () => {
  assert.equal(discountedBillAmount(100, 29), 71);
  assert.equal(discountedBillAmount(10000, 12.34), 8766);
});
test('free and no-discount cases', () => {
  assert.equal(discountedBillAmount(85000, 100), 0);
  assert.equal(discountedBillAmount(85000, 0), 85000);
  assert.equal(discountedBillAmount(0, 50), 0);
});
test('discount percentage normalization', () => {
  assert.equal(normalizeDiscountPercent(12.345), 12.35);
  assert.equal(normalizeDiscountPercent(Infinity), 0);
  assert.equal(normalizeDiscountPercent(-1), 0);
});
