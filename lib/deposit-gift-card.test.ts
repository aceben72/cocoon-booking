// Run: npm test
// Admin "Deposit paid" / "Gift card" maths: what's recorded at booking, and
// that a deposit is never charged twice and doesn't skew the cash discount.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminBookingAmounts,
  adminBookingPayment,
  appointmentBalanceCents,
  computeAdvancePayment,
  computeCompletion,
  defaultDepositCents,
  paidBalanceText,
  type CompletionInput,
} from "./complete-payment.ts";

// Indulge, current prices: $154 card, $149 cash/PayID
const indulge = (over: Partial<CompletionInput> = {}): CompletionInput => ({
  amountCents: 15400,
  couponDiscountCents: 0,
  loyaltyDiscountCents: 0,
  cashDiscountCents: 0,
  amountPaidCents: 0,
  servicePriceCents: 15400,
  serviceCashPriceCents: 14900,
  loyaltyRewardDueCents: 0,
  ...over,
});

test("worked example: Indulge $154, $50 card deposit → $104 card or $99 cash at Complete", () => {
  // Booking: Deposit paid, card in studio
  const amounts = adminBookingAmounts({ mode: "deposit_paid", priceCents: 15400, adminOnly: false, loyaltyRewardDueCents: 0 });
  assert.deepEqual(amounts, { status: "confirmed", amountCents: 15400, loyaltyDiscountCents: 0 });
  const pay = adminBookingPayment({ mode: "deposit_paid", priceCents: 15400, loyaltyRewardDueCents: 0, amountCents: 5000, depositMethod: "card" });
  assert.deepEqual(pay, { method: "card_square", amountCents: 5000 });

  // The trigger makes amount_paid_cents = 5000. Everything after reads that.
  const after = indulge({ amountPaidCents: 5000 });
  assert.equal(paidBalanceText(5000, appointmentBalanceCents({
    amount_cents: 15400, discount_cents: 0, loyalty_discount_cents: 0, cash_discount_cents: 0, amount_paid_cents: 5000,
  })), "$50 paid, $104 balance owing");

  const card = computeCompletion(after, "card");
  assert.equal(card.balanceBeforeCents, 10400);
  assert.deepEqual(card.payment, { method: "card_square", amountCents: 10400 });
  assert.equal(card.cashDiscountCents, 0);

  const cash = computeCompletion(after, "cash");
  assert.equal(cash.balanceBeforeCents, 9900);         // $149 cash price − $50, not ($154 − $50) × anything
  assert.equal(cash.cashDiscountCents, 500);           // full $5, on the price
  assert.deepEqual(cash.payment, { method: "cash", amountCents: 9900 });

  // appointments_payment_owing after completing cash: nothing owing, deposit counted once.
  assert.equal(appointmentBalanceCents({
    amount_cents: 15400, discount_cents: 0, loyalty_discount_cents: 0, cash_discount_cents: 500, amount_paid_cents: 5000 + 9900,
  }), 0);
});

test("deposit default: $50, $100 for lessons, never more than the price", () => {
  assert.equal(defaultDepositCents({}, 15400), 5000);
  assert.equal(defaultDepositCents({ deposit_cents: 10000 }, 16900), 10000);
  assert.equal(defaultDepositCents({ deposit_cents: 10000 }, 4500), 4500);
});

test("deposit amount: whole dollars, > $0, ≤ price (less a due loyalty reward)", () => {
  const p = { mode: "deposit_paid" as const, priceCents: 15400, loyaltyRewardDueCents: 0, depositMethod: "cash" as const };
  assert.deepEqual(adminBookingPayment({ ...p, amountCents: 15400 }), { method: "cash", amountCents: 15400 });
  assert.throws(() => adminBookingPayment({ ...p, amountCents: 0 }), /whole dollars/);
  assert.throws(() => adminBookingPayment({ ...p, amountCents: 5050 }), /whole dollars/);
  assert.throws(() => adminBookingPayment({ ...p, amountCents: 15500 }), /can't be more than \$154/);
  assert.throws(() => adminBookingPayment({ ...p, amountCents: 15400, loyaltyRewardDueCents: 5000 }), /can't be more than \$104/);
  assert.equal(adminBookingPayment({ ...p, mode: "pay_on_day", amountCents: 5000 }), null);
});

test("deposit / gift card at booking: gift card can't exceed its balance", () => {
  const p = { priceCents: 15400, loyaltyRewardDueCents: 0 };
  assert.deepEqual(
    adminBookingPayment({ ...p, mode: "deposit_paid", depositMethod: "gift_card", amountCents: 5000, giftCardRemainingCents: 10000 }),
    { method: "gift_card", amountCents: 5000 },
  );
  assert.deepEqual(
    adminBookingPayment({ ...p, mode: "gift_card", amountCents: 10000, giftCardRemainingCents: 10000 }),
    { method: "gift_card", amountCents: 10000 },
  );
  assert.throws(
    () => adminBookingPayment({ ...p, mode: "gift_card", amountCents: 12000, giftCardRemainingCents: 10000 }),
    /only has \$100 left/,
  );
});

test("split at Complete: Irene, Indulge $154, $100 gift card → $54 card or $49 cash/PayID", () => {
  const card = computeCompletion(indulge(), "card", undefined, 10000);
  assert.equal(card.giftCardCents, 10000);
  assert.deepEqual(card.payment, { method: "card_square", amountCents: 5400 });
  assert.equal(card.cashDiscountCents, 0);

  const cash = computeCompletion(indulge(), "cash", undefined, 10000);
  assert.deepEqual(cash.payment, { method: "cash", amountCents: 4900 });
  assert.equal(cash.cashDiscountCents, 500);

  const payid = computeCompletion(indulge(), "payid", undefined, 10000);
  assert.deepEqual(payid.payment, { method: "payid_bank", amountCents: 4900 });

  // Rest not paid yet: completed with $54 owing at the card price.
  const notPaid = computeCompletion(indulge(), "not_paid", undefined, 10000);
  assert.equal(notPaid.payment, null);
  assert.equal(notPaid.balanceAfterCents, 5400);
});

test("split after a deposit: $50 deposit + $100 gift card → $4 card / $0 cash", () => {
  const card = computeCompletion(indulge({ amountPaidCents: 5000 }), "card", undefined, 10000);
  assert.deepEqual(card.payment, { method: "card_square", amountCents: 400 });
  const cash = computeCompletion(indulge({ amountPaidCents: 5000 }), "cash", undefined, 10000);
  assert.equal(cash.payment, null);         // the $5 cash discount covers the last $4
  assert.equal(cash.cashDiscountCents, 400);
});

test("gift card covering everything: card price, no cash discount", () => {
  const r = computeCompletion(indulge(), "card", undefined, 15400);
  assert.equal(r.payment, null);
  assert.equal(r.cashDiscountCents, 0);
  assert.equal(r.balanceAfterCents, 0);
});

test("gift card more than is owed is refused", () => {
  assert.throws(() => computeCompletion(indulge(), "card", undefined, 15500), /Gift card amount/);
  assert.throws(() => computeCompletion(indulge({ amountPaidCents: 15400 }), "card", undefined, 100), /Gift card amount/);
  assert.throws(() => computeCompletion(indulge(), "card", undefined, -100), /Gift card amount/);
});

test("record now, don't complete: deposit on an existing booking; no discounts; loyalty due kept back", () => {
  const r = computeAdvancePayment(indulge(), "card", 5000);
  assert.deepEqual(r.payment, { method: "card_square", amountCents: 5000 });
  assert.equal(r.cashDiscountCents, 0);
  assert.equal(r.balanceAfterCents, 10400);

  const gift = computeAdvancePayment(indulge(), "not_paid", undefined, 10000);
  assert.equal(gift.payment, null);
  assert.equal(gift.giftCardCents, 10000);

  assert.throws(() => computeAdvancePayment(indulge({ loyaltyRewardDueCents: 5000 }), "card", 15400), /still owing/);
  assert.throws(() => computeAdvancePayment(indulge(), "not_paid", undefined, 20000), /Gift card amount/);
});

test("paid / balance wording", () => {
  assert.equal(paidBalanceText(5000, 10400), "$50 paid, $104 balance owing");
  assert.equal(paidBalanceText(0, 15400), "$154 balance owing");
  assert.equal(paidBalanceText(15400, 0), "$154 paid");
  assert.equal(paidBalanceText(0, 0), "Nothing owing");
  assert.equal(paidBalanceText(5050, 9950), "$50.50 paid, $99.50 balance owing");
});
