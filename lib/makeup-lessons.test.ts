// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAKEUP_LESSON_DEPOSIT_CENTS,
  bookingCashPriceCents,
  bookingPriceCents,
  lessonAttendeeRows,
  lessonAttendeeSlots,
  lessonSummaryLines,
  normaliseExtraDaughters,
  paymentLinkDepositCents,
} from "./makeup-lessons.ts";
import { computeBookingPricing } from "./booking-pricing.ts";
import { cashDiscountAvailable, computeCompletion, type CompletionInput } from "./complete-payment.ts";
import { cashSavingText } from "./utils.ts";

// As in lib/services-data.ts (which can't be loaded under node --test).
const PRIVATE = { name: "Private Make-Up Lesson", category: "make-up", price_cents: 27900, cash_price_cents: 27100 };
const FRIEND = { name: "Me & a Friend Make-Up Lesson", category: "make-up", price_cents: 34900, cash_price_cents: 33900 };
const MD = { name: "Mother & Daughter Make-Up Class", category: "mother-daughter", price_cents: 34900, cash_price_cents: 33900 };

const saving = (svc: { name: string; price_cents: number; cash_price_cents: number }, extras: number) =>
  cashSavingText(bookingPriceCents(svc, extras), bookingCashPriceCents(svc, extras));

test("prices: card $349 + $99n, cash $339 + $96n for Mother & Daughter", () => {
  assert.deepEqual([0, 1, 2].map((n) => bookingPriceCents(MD, n)), [34900, 44800, 54700]);
  assert.deepEqual([0, 1, 2].map((n) => bookingCashPriceCents(MD, n)), [33900, 43500, 53100]);
  assert.equal(bookingPriceCents(PRIVATE, 0), 27900);
  assert.equal(bookingPriceCents(FRIEND, 0), 34900);
});

test("extra daughters: Mother & Daughter only, 0–2", () => {
  assert.equal(normaliseExtraDaughters(MD.name, 2), 2);
  assert.equal(normaliseExtraDaughters(MD.name, 3), 2);
  assert.equal(normaliseExtraDaughters(MD.name, -1), 0);
  assert.equal(normaliseExtraDaughters(MD.name, "1"), 1);
  assert.equal(normaliseExtraDaughters(MD.name, 1.5), 0);
  assert.equal(normaliseExtraDaughters(MD.name, undefined), 0);
  // Anyone else sending extras gets charged nothing extra
  assert.equal(normaliseExtraDaughters(FRIEND.name, 2), 0);
  assert.equal(bookingPriceCents(FRIEND, 2), 34900);
  assert.equal(bookingPriceCents({ name: "Indulge Facial", price_cents: 15400 }, 2), 15400);
});

test("cash saving line: $8 Private, $10 two-person, + $3 per extra daughter", () => {
  assert.equal(saving(PRIVATE, 0), "Save $8 with cash, PayID or direct deposit");
  assert.equal(saving(FRIEND, 0), "Save $10 with cash, PayID or direct deposit");
  assert.equal(saving(MD, 0), "Save $10 with cash, PayID or direct deposit");
  assert.equal(saving(MD, 1), "Save $13 with cash, PayID or direct deposit");
  assert.equal(saving(MD, 2), "Save $16 with cash, PayID or direct deposit");
});

test("deposit: $100 comes off the total, balance right with extras", () => {
  for (const [svc, extras, balance] of [[PRIVATE, 0, 17900], [FRIEND, 0, 24900], [MD, 0, 24900], [MD, 1, 34800], [MD, 2, 44700]] as const) {
    const p = computeBookingPricing({
      priceCents: bookingPriceCents(svc, extras),
      payDeposit: true,
      depositCents: MAKEUP_LESSON_DEPOSIT_CENTS,
      couponDiscountCents: 0,
      loyaltyDiscountCents: 0,
      giftCardBalanceCents: 0,
      paidViaFacialPackage: false,
    });
    assert.equal(p.chargeNowCents, 10000, `${svc.name} +${extras}`);
    assert.equal(p.balanceDueCents, balance, `${svc.name} +${extras}`);
  }
});

test("gift cards: cover the deposit, the full amount, or part of it", () => {
  const price = bookingPriceCents(FRIEND, 0); // $349
  const pricing = (gc: number, payDeposit: boolean) => computeBookingPricing({
    priceCents: price, payDeposit, depositCents: MAKEUP_LESSON_DEPOSIT_CENTS,
    couponDiscountCents: 0, loyaltyDiscountCents: 0, giftCardBalanceCents: gc, paidViaFacialPackage: false,
  });
  // $200 card, deposit option: card covers the deposit and more; $149 on the day
  assert.deepEqual([pricing(20000, true).giftCardAppliedCents, pricing(20000, true).chargeNowCents, pricing(20000, true).balanceDueCents], [20000, 0, 14900]);
  // $200 card, pay in full: $149 to card now
  assert.deepEqual([pricing(20000, false).chargeNowCents, pricing(20000, false).balanceDueCents], [14900, 0]);
  // $60 card, deposit: card + $40 card charge = the $100 deposit
  assert.deepEqual([pricing(6000, true).chargeNowCents, pricing(6000, true).balanceDueCents], [4000, 24900]);
  // $500 card covers everything; only $349 used
  assert.deepEqual([pricing(50000, true).giftCardAppliedCents, pricing(50000, true).chargeNowCents, pricing(50000, true).balanceDueCents], [34900, 0, 0]);
});

test("payment links: $100 deposit for lessons, $50 for everything else", () => {
  assert.equal(paymentLinkDepositCents(PRIVATE.name), 10000);
  assert.equal(paymentLinkDepositCents(FRIEND.name), 10000);
  assert.equal(paymentLinkDepositCents(MD.name), 10000);
  assert.equal(paymentLinkDepositCents("Indulge Facial"), 5000);
  assert.equal(paymentLinkDepositCents("Agebiotic System"), 5000);
});

// ── Complete panel ─────────────────────────────────────────────────────────
const mdInput = (extras: number, over: Partial<CompletionInput> = {}): CompletionInput => ({
  amountCents: bookingPriceCents(MD, extras),
  couponDiscountCents: 0,
  loyaltyDiscountCents: 0,
  cashDiscountCents: 0,
  amountPaidCents: 10000, // $100 deposit
  serviceName: MD.name,
  servicePriceCents: MD.price_cents,
  serviceCashPriceCents: MD.cash_price_cents,
  addOnCardCents: extras * 9900,
  addOnCashCents: extras * 9600,
  loyaltyRewardDueCents: 0,
  ...over,
});

test("Complete: Mother & Daughter cash total is $339 + $96n, card $349 + $99n", () => {
  for (const n of [0, 1, 2]) {
    const input = mdInput(n);
    assert.equal(cashDiscountAvailable(input), 1000 + 300 * n);
    const cash = computeCompletion(input, "cash");
    assert.equal(cash.payment!.amountCents + 10000, 33900 + 9600 * n, `cash, ${n} extra`);
    const card = computeCompletion(input, "card");
    assert.equal(card.payment!.amountCents + 10000, 34900 + 9900 * n, `card, ${n} extra`);
  }
});

test("Complete: Private and Me & a Friend cash discounts", () => {
  const base = (svc: typeof PRIVATE) => ({
    amountCents: svc.price_cents, serviceName: svc.name,
    servicePriceCents: svc.price_cents, serviceCashPriceCents: svc.cash_price_cents,
  });
  assert.equal(cashDiscountAvailable(base(PRIVATE)), 800);
  assert.equal(cashDiscountAvailable(base(FRIEND)), 1000);
});

test("Complete: bookings made at the old prices keep their old cash discount", () => {
  // Personal Make Up Class at $164 / $159 (row renamed to Private Make-Up Lesson)
  assert.equal(cashDiscountAvailable({ amountCents: 16400, serviceName: PRIVATE.name, servicePriceCents: 27900, serviceCashPriceCents: 27100 }), 500);
  // Mother Daughter at $185 / $179
  assert.equal(cashDiscountAvailable({ amountCents: 18500, serviceName: MD.name, servicePriceCents: 34900, serviceCashPriceCents: 33900 }), 600);
  // Pre-1 Oct prices never had one
  assert.equal(cashDiscountAvailable({ amountCents: 15900, serviceName: PRIVATE.name, servicePriceCents: 27900, serviceCashPriceCents: 27100 }), 0);
  assert.equal(cashDiscountAvailable({ amountCents: 17900, serviceName: MD.name, servicePriceCents: 34900, serviceCashPriceCents: 33900 }), 0);
  // An amount that doesn't match any price (e.g. hand-edited) gets none
  assert.equal(cashDiscountAvailable(mdInput(0, { amountCents: 40000 })), 0);
});

// ── Attendees ──────────────────────────────────────────────────────────────
test("attendees: one row per person, levels optional, friend details only for the friend", () => {
  assert.deepEqual(lessonAttendeeSlots(PRIVATE.name, 0).map((s) => s.role), ["client"]);
  assert.deepEqual(lessonAttendeeSlots(FRIEND.name, 0).map((s) => s.role), ["client", "friend"]);
  assert.deepEqual(lessonAttendeeSlots(MD.name, 2).map((s) => `${s.role}:${s.position}`), ["mum:1", "daughter:1", "extra_daughter:1", "extra_daughter:2"]);
  assert.deepEqual(lessonAttendeeSlots("Indulge Facial", 0), []);

  const rows = lessonAttendeeRows(FRIEND.name, {
    levels: { "client:1": "beginner", "friend:1": "nonsense" },
    friend: { name: "  Jo  ", email: "", mobile: "0412 345 678" },
  });
  assert.deepEqual(rows, [
    { role: "client", position: 1, experience_level: "beginner", name: null, email: null, mobile: null },
    { role: "friend", position: 1, experience_level: null, name: "Jo", email: null, mobile: "0412 345 678" },
  ]);

  // Mother & Daughter: friend details ignored, extras capped
  const md = lessonAttendeeRows(MD.name, { extraDaughters: 5, levels: { "extra_daughter:2": "confident" }, friend: { name: "x" } });
  assert.equal(md.length, 4);
  assert.equal(md[3].experience_level, "confident");
  assert.ok(md.every((r) => r.name === null));

  assert.deepEqual(lessonSummaryLines(md, 2).slice(0, 2), ["Extra daughters: 2", "Mum — not answered"]);
});
