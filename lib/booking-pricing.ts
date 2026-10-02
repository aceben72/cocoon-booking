/**
 * Online booking price breakdown — shared by StepPayment (display) and
 * POST /api/bookings (what is actually charged) so the two can't drift.
 * Pure logic only (no imports) so it can be unit-tested with `node --test`.
 */

export interface BookingPricingInput {
  priceCents: number;              // card price (services-data.ts)
  payDeposit: boolean;             // client chose the deposit option (and the service allows it)
  depositCents: number;
  couponDiscountCents: number;     // from calculateDiscount(), 0 if none
  loyaltyDiscountCents: number;    // LOYALTY_REWARD_CENTS if due, else 0
  giftCardBalanceCents: number;    // remaining gift card value, 0 if none
  paidViaFacialPackage: boolean;
}

export interface BookingPricing {
  couponDiscountCents: number;
  loyaltyDiscountCents: number;
  giftCardAppliedCents: number;
  /** Charged to card now. */
  chargeNowCents: number;
  /** Still owed on the day at the card price (before any cash/PayID saving). */
  balanceDueCents: number;
}

export function computeBookingPricing(input: BookingPricingInput): BookingPricing {
  // A facial package covers the whole appointment and trumps every discount.
  if (input.paidViaFacialPackage) {
    return { couponDiscountCents: 0, loyaltyDiscountCents: 0, giftCardAppliedCents: 0, chargeNowCents: 0, balanceDueCents: 0 };
  }

  const price = input.priceCents;
  const coupon = Math.min(Math.max(0, input.couponDiscountCents), price);
  const loyalty = Math.min(Math.max(0, input.loyaltyDiscountCents), price - coupon);
  const net = price - coupon - loyalty;

  // A gift card is a payment method, not a discount — it covers what's left.
  const giftCard = Math.min(Math.max(0, input.giftCardBalanceCents), net);

  const chargeNow = input.payDeposit
    // Coupon and gift card come off the deposit (existing behaviour); the
    // loyalty reward comes off the balance, but never charge more than is owed.
    ? Math.max(0, Math.min(input.depositCents - coupon - giftCard, net - giftCard))
    : net - giftCard;

  return {
    couponDiscountCents: coupon,
    loyaltyDiscountCents: loyalty,
    giftCardAppliedCents: giftCard,
    chargeNowCents: chargeNow,
    balanceDueCents: net - giftCard - chargeNow,
  };
}
