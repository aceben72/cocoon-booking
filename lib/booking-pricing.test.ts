// Run: node --test lib/
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBookingPricing, type BookingPricingInput } from "./booking-pricing.ts";

const base: BookingPricingInput = {
  priceCents: 15400,
  payDeposit: false,
  depositCents: 5000,
  couponDiscountCents: 0,
  loyaltyDiscountCents: 0,
  giftCardBalanceCents: 0,
  paidViaFacialPackage: false,
};
const price = (over: Partial<BookingPricingInput>) => computeBookingPricing({ ...base, ...over });

test("no discounts: full or deposit", () => {
  assert.equal(price({}).chargeNowCents, 15400);
  const dep = price({ payDeposit: true });
  assert.equal(dep.chargeNowCents, 5000);
  assert.equal(dep.balanceDueCents, 10400);
});

test("loyalty, paid in full: card price − $50", () => {
  const p = price({ loyaltyDiscountCents: 5000 });
  assert.equal(p.chargeNowCents, 10400);
  assert.equal(p.balanceDueCents, 0);
});

test("loyalty with deposit: $50 deposit, $50 off the balance", () => {
  const p = price({ loyaltyDiscountCents: 5000, payDeposit: true });
  assert.equal(p.chargeNowCents, 5000);
  assert.equal(p.balanceDueCents, 5400); // $154 − $50 − $50 deposit
});

test("facial package redemption: nothing charged, loyalty and other discounts ignored", () => {
  const p = price({
    paidViaFacialPackage: true,
    loyaltyDiscountCents: 5000,
    couponDiscountCents: 2000,
    giftCardBalanceCents: 10000,
    payDeposit: true,
  });
  assert.deepEqual(p, {
    couponDiscountCents: 0,
    loyaltyDiscountCents: 0,
    giftCardAppliedCents: 0,
    chargeNowCents: 0,
    balanceDueCents: 0,
  });
});

test("gift card covers what's left after coupon and loyalty", () => {
  const p = price({ loyaltyDiscountCents: 5000, couponDiscountCents: 1000, giftCardBalanceCents: 20000 });
  assert.equal(p.giftCardAppliedCents, 9400);
  assert.equal(p.chargeNowCents, 0);
});

test("deposit never exceeds what is owed", () => {
  // $47 service with $50 off would be negative — clamps to 0
  const p = price({ priceCents: 4700, loyaltyDiscountCents: 5000, payDeposit: true });
  assert.equal(p.loyaltyDiscountCents, 4700);
  assert.equal(p.chargeNowCents, 0);
  assert.equal(p.balanceDueCents, 0);
});

test("coupon with deposit keeps existing behaviour (comes off the deposit)", () => {
  const p = price({ couponDiscountCents: 1000, payDeposit: true });
  assert.equal(p.chargeNowCents, 4000);
  assert.equal(p.balanceDueCents, 10400);
});
