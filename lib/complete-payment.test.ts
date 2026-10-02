// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminBookingAmounts,
  cashDiscountAvailable,
  computeCompletion,
  onlineBookingPaymentRows,
  type CompletionInput,
} from "./complete-payment.ts";
import { computeBookingPricing } from "./booking-pricing.ts";

// Indulge, current prices: $154 card, $149 cash/PayID
const INDULGE = { servicePriceCents: 15400, serviceCashPriceCents: 14900 };

/** Minimal model of appointments + appointment_payments, as the DB trigger keeps them. */
function ledger(appt: { amountCents: number; couponDiscountCents?: number; loyaltyDiscountCents?: number }) {
  const row = {
    amount_cents: appt.amountCents,
    discount_cents: appt.couponDiscountCents ?? 0,
    loyalty_discount_cents: appt.loyaltyDiscountCents ?? 0,
    cash_discount_cents: 0,
    amount_paid_cents: 0,
    status: "confirmed",
  };
  const payments: { method: string; amount_cents: number; square_payment_id: string | null }[] = [];
  const pay = (method: string, amount: number, squarePaymentId: string | null = null) => {
    payments.push({ method, amount_cents: amount, square_payment_id: squarePaymentId });
    row.amount_paid_cents = payments.reduce((s, p) => s + p.amount_cents, 0); // the trigger
  };
  return {
    row,
    payments,
    pay,
    input(loyaltyRewardDueCents: number): CompletionInput {
      return {
        amountCents: row.amount_cents,
        couponDiscountCents: row.discount_cents,
        loyaltyDiscountCents: row.loyalty_discount_cents,
        cashDiscountCents: row.cash_discount_cents,
        amountPaidCents: row.amount_paid_cents,
        ...INDULGE,
        loyaltyRewardDueCents,
      };
    },
    /** What record_appointment_payment() writes. */
    complete(r: ReturnType<typeof computeCompletion>) {
      row.cash_discount_cents = r.cashDiscountCents;
      row.loyalty_discount_cents = r.loyaltyDiscountCents;
      row.status = "completed";
      if (r.payment) pay(r.payment.method, r.payment.amountCents);
    },
    balance() {
      return row.amount_cents - row.discount_cents - row.loyalty_discount_cents - row.cash_discount_cents - row.amount_paid_cents;
    },
  };
}

const base = (over: Partial<CompletionInput> = {}): CompletionInput => ({
  amountCents: 15400,
  couponDiscountCents: 0,
  loyaltyDiscountCents: 0,
  cashDiscountCents: 0,
  amountPaidCents: 0,
  ...INDULGE,
  loyaltyRewardDueCents: 0,
  ...over,
});

test("everyday case 1: booked by Amanda in admin → Complete → Paid cash", () => {
  // Booking: pay on the day — takes the card price, nothing paid, no payment rows yet
  const amounts = adminBookingAmounts({ mode: "pay_on_day", priceCents: 15400, adminOnly: false, loyaltyRewardDueCents: 0 });
  assert.deepEqual(amounts, { status: "confirmed", amountCents: 15400, loyaltyDiscountCents: 0 });
  const l = ledger({ amountCents: amounts.amountCents });
  assert.equal(l.payments.length, 0);

  // Complete → Paid cash
  const r = computeCompletion(l.input(0), "cash");
  assert.equal(r.balanceBeforeCents, 14900);
  l.complete(r);

  assert.deepEqual(l.row, {
    amount_cents: 15400,
    discount_cents: 0,
    loyalty_discount_cents: 0,
    cash_discount_cents: 500,
    amount_paid_cents: 14900,
    status: "completed",
  });
  assert.deepEqual(l.payments, [{ method: "cash", amount_cents: 14900, square_payment_id: null }]);
  assert.equal(l.balance(), 0);
});

test("everyday case 2: online Square deposit → Complete → Paid PayID, loyalty due", () => {
  // Online booking, deposit; loyalty not applied at checkout (4th booked before the 3rd was completed)
  const pricing = computeBookingPricing({
    priceCents: 15400, payDeposit: true, depositCents: 5000,
    couponDiscountCents: 0, loyaltyDiscountCents: 0, giftCardBalanceCents: 0, paidViaFacialPackage: false,
  });
  const l = ledger({ amountCents: 15400 });
  for (const p of onlineBookingPaymentRows({ ...pricing, paidViaFacialPackage: false, priceCents: 15400, squarePaymentId: "sq_123" })) {
    l.pay(p.method, p.amountCents, p.squarePaymentId);
  }
  assert.deepEqual(l.payments, [{ method: "card_square", amount_cents: 5000, square_payment_id: "sq_123" }]);

  // Complete → Paid PayID with the $50 reward now due
  const r = computeCompletion(l.input(5000), "payid");
  assert.equal(r.balanceBeforeCents, 4900); // $149 cash price − $50 reward − $50 deposit
  l.complete(r);

  assert.deepEqual(l.row, {
    amount_cents: 15400,
    discount_cents: 0,
    loyalty_discount_cents: 5000,
    cash_discount_cents: 500,
    amount_paid_cents: 9900,
    status: "completed",
  });
  assert.deepEqual(l.payments, [
    { method: "card_square", amount_cents: 5000, square_payment_id: "sq_123" },
    { method: "payid_bank", amount_cents: 4900, square_payment_id: null },
  ]);
  assert.equal(l.balance(), 0);
});

test("Paid card: card-price balance, no cash discount", () => {
  const r = computeCompletion(base({ amountPaidCents: 5000 }), "card");
  assert.deepEqual(r.payment, { method: "card_square", amountCents: 10400 });
  assert.equal(r.cashDiscountCents, 0);
});

test("loyalty with card: card price − $50", () => {
  const r = computeCompletion(base({ loyaltyRewardDueCents: 5000 }), "card");
  assert.deepEqual(r.payment, { method: "card_square", amountCents: 10400 });
  assert.equal(r.loyaltyDiscountCents, 5000);
});

test("Not paid yet: completed with balance owing, no payment row; loyalty still applied", () => {
  const r = computeCompletion(base({ loyaltyRewardDueCents: 5000 }), "not_paid");
  assert.equal(r.payment, null);
  assert.equal(r.cashDiscountCents, 0);
  assert.equal(r.loyaltyDiscountCents, 5000);
  assert.equal(r.balanceAfterCents, 10400);
});

test("later cash payment on a 'not paid yet' booking gets the cash discount then, loyalty not doubled", () => {
  const r = computeCompletion(base({ loyaltyDiscountCents: 5000 }), "cash");
  assert.deepEqual(r.payment, { method: "cash", amountCents: 9900 });
  assert.equal(r.loyaltyDiscountCents, 5000);
});

test("booked before 1 Oct (old price) → no cash discount", () => {
  // amount_cents 14900 was the old price; the current card price is 15400
  assert.equal(cashDiscountAvailable({ amountCents: 14900, ...INDULGE }), 0);
  const r = computeCompletion(base({ amountCents: 14900, amountPaidCents: 5000 }), "cash");
  assert.deepEqual(r.payment, { method: "cash", amountCents: 9900 });
  assert.equal(r.cashDiscountCents, 0);
});

test("no cash price (Basic LED) → no cash discount", () => {
  assert.equal(cashDiscountAvailable({ amountCents: 4700, servicePriceCents: 4700, serviceCashPriceCents: null }), 0);
});

test("cash discount isn't applied twice", () => {
  const r = computeCompletion(base({ cashDiscountCents: 500, amountPaidCents: 7000 }), "cash");
  assert.equal(r.cashDiscountCents, 500);
  assert.deepEqual(r.payment, { method: "cash", amountCents: 7900 });
});

test("Other amount: part payment leaves the rest owing; too much or zero is refused", () => {
  const r = computeCompletion(base(), "cash", 10000);
  assert.deepEqual(r.payment, { method: "cash", amountCents: 10000 });
  assert.equal(r.balanceAfterCents, 4900);
  assert.throws(() => computeCompletion(base(), "card", 15500));
  assert.throws(() => computeCompletion(base(), "card", 0));
});

test("prepaid in full online, loyalty due at Complete → nothing to pay, overpaid flagged for refund", () => {
  const r = computeCompletion(base({ amountPaidCents: 15400, loyaltyRewardDueCents: 5000 }), "cash");
  assert.equal(r.payment, null);
  assert.equal(r.cashDiscountCents, 0); // nothing was paid in cash
  assert.equal(r.overpaidCents, 5000);
});

test("online booking rows: gift card + Square; facial package covers all", () => {
  assert.deepEqual(
    onlineBookingPaymentRows({ chargeNowCents: 4900, giftCardAppliedCents: 15000, paidViaFacialPackage: false, priceCents: 19900, squarePaymentId: "sq_9" })
      .map((r) => [r.method, r.amountCents]),
    [["gift_card", 15000], ["card_square", 4900]],
  );
  assert.deepEqual(
    onlineBookingPaymentRows({ chargeNowCents: 0, giftCardAppliedCents: 0, paidViaFacialPackage: true, priceCents: 15400, squarePaymentId: null })
      .map((r) => [r.method, r.amountCents]),
    [["facial_package", 15400]],
  );
});

test("admin booking amounts: no charge and admin-only are $0; payment link applies a due reward up front", () => {
  assert.equal(adminBookingAmounts({ mode: "no_charge", priceCents: 15400, adminOnly: false, loyaltyRewardDueCents: 0 }).amountCents, 0);
  assert.equal(adminBookingAmounts({ mode: "pay_on_day", priceCents: 0, adminOnly: true, loyaltyRewardDueCents: 0 }).amountCents, 0);
  assert.deepEqual(
    adminBookingAmounts({ mode: "payment_link", priceCents: 15400, adminOnly: false, loyaltyRewardDueCents: 5000 }),
    { status: "pending_payment", amountCents: 15400, loyaltyDiscountCents: 5000 },
  );
});
