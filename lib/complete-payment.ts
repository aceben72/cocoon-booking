/**
 * Complete / record-payment maths for the admin Complete panel.
 * Pure logic only (no imports) so it can be unit-tested with `node --test`.
 * POST /api/admin/appointments/[id]/payment uses it to decide what to write.
 */

export type PaymentMethod = "card_square" | "cash" | "payid_bank" | "gift_card" | "facial_package" | "unknown";

/** The panel's buttons. */
export type CompleteChoice = "cash" | "payid" | "card" | "not_paid";

export const CHOICE_METHOD: Record<Exclude<CompleteChoice, "not_paid">, PaymentMethod> = {
  cash: "cash",
  payid: "payid_bank",
  card: "card_square",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  card_square: "Card (Square)",
  cash: "Cash",
  payid_bank: "PayID / bank transfer",
  gift_card: "Gift card",
  facial_package: "Facial package",
  unknown: "Method not recorded",
};

export interface CompletionInput {
  amountCents: number;            // appointments.amount_cents (card price snapshot at booking)
  couponDiscountCents: number;    // appointments.discount_cents
  loyaltyDiscountCents: number;   // appointments.loyalty_discount_cents (already applied)
  cashDiscountCents: number;      // appointments.cash_discount_cents (already applied)
  amountPaidCents: number;        // appointments.amount_paid_cents
  serviceName?: string;           // services.name, for EARLIER_CARD_PRICES
  servicePriceCents: number;     // services.price_cents (current card price)
  serviceCashPriceCents: number | null; // services.cash_price_cents (null = no cash price)
  /**
   * Add-ons priced into amount_cents on top of the service (Mother & Daughter
   * extra daughters): their card total and cash total. From
   * lib/makeup-lessons.ts; 0/0 when there are none.
   */
  addOnCardCents?: number;
  addOnCashCents?: number;
  loyaltyRewardDueCents: number;  // from getLoyaltyRewardForAppointment when due, else 0
}

export interface CompletionResult {
  /** Totals to store on the appointment. */
  cashDiscountCents: number;
  loyaltyDiscountCents: number;
  /** Gift card value redeemed in this completion (0 if none). */
  giftCardCents: number;
  /** Owing before this payment (after the gift card, if any), after all discounts. */
  balanceBeforeCents: number;
  /** Payment row to write, or null (not paid yet / nothing owing). */
  payment: { method: PaymentMethod; amountCents: number } | null;
  balanceAfterCents: number;
  /** Paid more than is owed after discounts (e.g. prepaid in full, then loyalty due) — refund this. */
  overpaidCents: number;
}

/**
 * Card/cash price pairs a service had AFTER the 1 Oct 2026 change but no
 * longer has, keyed by services.name. Bookings snapshot the card price in
 * amount_cents, so a booking made at one of these keeps that pair's cash
 * discount. Never list a pre-1 Oct price here: those had no cash discount.
 */
export const EARLIER_CARD_PRICES: Record<string, { priceCents: number; cashPriceCents: number }[]> = {
  // 22 Oct 2026: $134 / $130 → $139 / $135
  "Professional Make-Up Application": [{ priceCents: 13400, cashPriceCents: 13000 }],
  // Nov 2026 lesson restructure. Keyed by the NEW names: the rows were renamed
  // in place, so old bookings now read back under these names.
  // Was "Personal Make Up Class", $164 / $159.
  "Private Make-Up Lesson": [{ priceCents: 16400, cashPriceCents: 15900 }],
  // Was "Mother Daughter Make-Up Class", $185 / $179.
  "Mother & Daughter Make-Up Class": [{ priceCents: 18500, cashPriceCents: 17900 }],
};

/**
 * The cash/PayID discount for this booking: card price − cash price at the
 * card price the booking was made at — today's (services.price_cents) or an
 * earlier post-1 Oct one (EARLIER_CARD_PRICES) — plus the add-ons' own saving
 * (Mother & Daughter: $3 per extra daughter). amount_cents includes the
 * add-ons, so they're taken off before matching the service price. Anything
 * else, e.g. a booking made before the 1 Oct price change, gets no discount.
 */
export function cashDiscountAvailable(
  input: Pick<CompletionInput, "amountCents" | "serviceName" | "servicePriceCents" | "serviceCashPriceCents" | "addOnCardCents" | "addOnCashCents">,
): number {
  const addOnCard = input.addOnCardCents ?? 0;
  const addOnSaving = Math.max(0, addOnCard - (input.addOnCashCents ?? addOnCard));
  const baseCents = input.amountCents - addOnCard;
  if (baseCents === input.servicePriceCents) {
    if (input.serviceCashPriceCents == null) return 0;
    return Math.max(0, input.servicePriceCents - input.serviceCashPriceCents) + addOnSaving;
  }
  const earlier = (EARLIER_CARD_PRICES[input.serviceName ?? ""] ?? []).find((p) => p.priceCents === baseCents);
  return earlier ? Math.max(0, earlier.priceCents - earlier.cashPriceCents) + addOnSaving : 0;
}

/**
 * What happens if Amanda taps `choice`. `otherAmountCents` is the "Other
 * amount" option (part payment); without it the whole balance is paid.
 * Throws if the other amount is not between 1 cent and the balance.
 *
 * `giftCardCents` (split payment): a gift card covers that much first, at the
 * card price, and `choice` pays the rest. The cash/PayID discount is on the
 * price, so it still comes off in full when the rest is paid cash or PayID
 * (Indulge $154, $100 gift card → $54 card or $49 cash). A gift card on its
 * own is not cash: no discount. Throws if it's more than is owed.
 */
export function computeCompletion(
  input: CompletionInput,
  choice: CompleteChoice,
  otherAmountCents?: number,
  giftCardCents = 0,
): CompletionResult {
  // Loyalty is independent of payment method; never applied twice.
  const loyalty = input.loyaltyDiscountCents > 0 ? input.loyaltyDiscountCents : Math.max(0, input.loyaltyRewardDueCents);

  const owingBeforeGift = input.amountCents - input.couponDiscountCents - loyalty - input.amountPaidCents;
  if (giftCardCents !== 0) {
    if (!Number.isInteger(giftCardCents) || giftCardCents < 0 || giftCardCents > Math.max(0, owingBeforeGift)) {
      throw new Error(`Gift card amount must be between $0.01 and the $${(Math.max(0, owingBeforeGift) / 100).toFixed(2)} owing`);
    }
  }
  const owingBeforeCash = owingBeforeGift - giftCardCents;

  // Cash/PayID discount: only when paying cash/PayID, something is still owed,
  // and it hasn't been applied already. Never more than what's owed.
  let cash = input.cashDiscountCents;
  if (cash === 0 && (choice === "cash" || choice === "payid") && owingBeforeCash > 0) {
    cash = Math.min(cashDiscountAvailable(input), owingBeforeCash);
  }

  const raw = owingBeforeCash - cash;
  const balanceBefore = Math.max(0, raw);
  const overpaid = Math.max(0, -raw);

  let payment: CompletionResult["payment"] = null;
  if (choice !== "not_paid" && balanceBefore > 0) {
    const amount = otherAmountCents ?? balanceBefore;
    if (!Number.isInteger(amount) || amount <= 0 || amount > balanceBefore) {
      throw new Error(`Amount must be between $0.01 and the balance of $${(balanceBefore / 100).toFixed(2)}`);
    }
    payment = { method: CHOICE_METHOD[choice], amountCents: amount };
  }

  return {
    cashDiscountCents: cash,
    loyaltyDiscountCents: loyalty,
    giftCardCents,
    balanceBeforeCents: balanceBefore,
    payment,
    balanceAfterCents: balanceBefore - (payment?.amountCents ?? 0),
    overpaidCents: overpaid,
  };
}

/**
 * A payment taken before the appointment without completing it (a deposit or
 * gift card against an existing booking). No cash or loyalty discount yet —
 * those are worked out at Complete on the price — but a loyalty reward that
 * will be due is kept back so the booking can't end up overpaid. The amount
 * is the "other amount" (needed unless only a gift card is used).
 */
export function computeAdvancePayment(
  input: CompletionInput,
  choice: CompleteChoice,
  otherAmountCents: number | undefined,
  giftCardCents = 0,
): CompletionResult {
  const loyaltyDue = input.loyaltyDiscountCents > 0 ? 0 : Math.max(0, input.loyaltyRewardDueCents);
  const owing = Math.max(0, input.amountCents - input.couponDiscountCents - input.loyaltyDiscountCents - input.cashDiscountCents - loyaltyDue - input.amountPaidCents);
  if (!Number.isInteger(giftCardCents) || giftCardCents < 0 || giftCardCents > owing) {
    throw new Error(`Gift card amount must be no more than the $${(owing / 100).toFixed(2)} owing`);
  }
  let payment: CompletionResult["payment"] = null;
  if (choice !== "not_paid" && otherAmountCents !== undefined) {
    if (!Number.isInteger(otherAmountCents) || otherAmountCents <= 0 || otherAmountCents > owing - giftCardCents) {
      throw new Error(`Amount must be between $0.01 and the $${((owing - giftCardCents) / 100).toFixed(2)} still owing`);
    }
    payment = { method: CHOICE_METHOD[choice], amountCents: otherAmountCents };
  }
  return {
    cashDiscountCents: input.cashDiscountCents,
    loyaltyDiscountCents: input.loyaltyDiscountCents,
    giftCardCents,
    balanceBeforeCents: owing - giftCardCents,
    payment,
    balanceAfterCents: owing - giftCardCents - (payment?.amountCents ?? 0),
    overpaidCents: 0,
  };
}

export interface NewPaymentRow {
  method: PaymentMethod;
  amountCents: number;
  squarePaymentId: string | null;
  notes: string;
}

/**
 * Payment rows written when an online booking is created (POST /api/bookings):
 * the Square charge, any gift card value, or the facial package covering it.
 * Their sum is the appointment's amount_paid_cents.
 */
export function onlineBookingPaymentRows(p: {
  chargeNowCents: number;
  giftCardAppliedCents: number;
  paidViaFacialPackage: boolean;
  priceCents: number;
  squarePaymentId: string | null;
}): NewPaymentRow[] {
  if (p.paidViaFacialPackage) {
    return [{ method: "facial_package", amountCents: p.priceCents, squarePaymentId: null, notes: "Facial package redemption" }];
  }
  const rows: NewPaymentRow[] = [];
  if (p.giftCardAppliedCents > 0) {
    rows.push({ method: "gift_card", amountCents: p.giftCardAppliedCents, squarePaymentId: null, notes: "Gift card redemption" });
  }
  if (p.chargeNowCents > 0) {
    rows.push({ method: "card_square", amountCents: p.chargeNowCents, squarePaymentId: p.squarePaymentId, notes: "Online booking" });
  }
  return rows;
}

/**
 * pay_on_day    confirmed, nothing paid yet
 * deposit_paid  confirmed, a deposit already taken in studio (card / cash or PayID / gift card)
 * gift_card     confirmed, a gift card covers some or all of it now
 * payment_link  pending_payment until the client pays the link
 * no_charge     confirmed at $0
 */
export type AdminBookingMode = "pay_on_day" | "deposit_paid" | "gift_card" | "payment_link" | "no_charge";

export const ADMIN_BOOKING_MODES: AdminBookingMode[] = ["pay_on_day", "deposit_paid", "gift_card", "payment_link", "no_charge"];

/** How a studio deposit was taken. Cash and PayID are one option (Amanda's wording) recorded as cash. */
export type DepositMethod = "card" | "cash" | "gift_card";

export const DEPOSIT_METHOD_PAYMENT: Record<DepositMethod, PaymentMethod> = {
  card: "card_square",
  cash: "cash",
  gift_card: "gift_card",
};

/** Default deposit for the admin form: the service's deposit ($100 lessons, else $50), never more than the price. */
export function defaultDepositCents(service: { deposit_cents?: number }, priceCents: number): number {
  return Math.min(service.deposit_cents ?? 5000, priceCents);
}

/**
 * The payment to record when an admin booking is made, or null (nothing paid
 * yet). Throws a message for Amanda if the amount is wrong. Amounts are whole
 * dollars, more than $0, and never more than the price less a loyalty reward
 * that will be due at Complete (so the booking can't end up overpaid). A gift
 * card can't be used for more than its balance.
 */
export function adminBookingPayment(p: {
  mode: AdminBookingMode;
  priceCents: number;
  loyaltyRewardDueCents: number;
  amountCents?: number;
  depositMethod?: DepositMethod;
  giftCardRemainingCents?: number;
}): { method: PaymentMethod; amountCents: number } | null {
  if (p.mode !== "deposit_paid" && p.mode !== "gift_card") return null;

  const method: PaymentMethod | undefined = p.mode === "gift_card" ? "gift_card" : DEPOSIT_METHOD_PAYMENT[p.depositMethod ?? "card"];
  if (!method) throw new Error("Choose how the deposit was paid");

  const max = Math.max(0, p.priceCents - Math.max(0, p.loyaltyRewardDueCents));
  const amount = p.amountCents;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount % 100 !== 0) {
    throw new Error("Enter the amount paid in whole dollars, more than $0");
  }
  if (amount > max) {
    throw new Error(`The amount paid can't be more than $${(max / 100).toFixed(0)}${p.loyaltyRewardDueCents > 0 ? " (the price less the loyalty reward due)" : ""}`);
  }
  if (method === "gift_card") {
    const remaining = p.giftCardRemainingCents ?? 0;
    if (amount > remaining) {
      throw new Error(`The gift card only has ${dollars(remaining)} left`);
    }
  }
  return { method, amountCents: amount };
}

function dollars(c: number) {
  const d = c / 100;
  return d % 1 === 0 ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
}

/**
 * "$50 paid, $104 balance owing" — the one wording for a part-paid booking,
 * used wherever a balance shows (appointment list, phone sheet, Complete panel).
 */
export function paidBalanceText(paidCents: number, owingCents: number): string {
  if (owingCents <= 0) return paidCents > 0 ? `${dollars(paidCents)} paid` : "Nothing owing";
  if (paidCents <= 0) return `${dollars(owingCents)} balance owing`;
  return `${dollars(paidCents)} paid, ${dollars(owingCents)} balance owing`;
}

/**
 * Amounts for a booking Amanda makes in admin. Only "no charge" (or an
 * admin-only service like Treatment Plan Facial) is $0; every other booking
 * takes the service's card price. A payment-link booking gets a due loyalty
 * reward applied up front so the link never charges more than is owed.
 * Deposit-paid and gift-card bookings are confirmed like pay-on-the-day; the
 * loyalty reward is applied at Complete.
 */
export function adminBookingAmounts(p: {
  mode: AdminBookingMode;
  priceCents: number;
  adminOnly: boolean;
  loyaltyRewardDueCents: number;
}): { status: "confirmed" | "pending_payment"; amountCents: number; loyaltyDiscountCents: number } {
  if (p.mode === "no_charge" || p.adminOnly) {
    return { status: "confirmed", amountCents: 0, loyaltyDiscountCents: 0 };
  }
  if (p.mode === "payment_link") {
    return { status: "pending_payment", amountCents: p.priceCents, loyaltyDiscountCents: Math.min(p.loyaltyRewardDueCents, p.priceCents) };
  }
  return { status: "confirmed", amountCents: p.priceCents, loyaltyDiscountCents: 0 };
}

/**
 * Balance still owed on an appointment after every discount and payment.
 * Same rule as the appointments_payment_owing view.
 */
export function appointmentBalanceCents(a: {
  amount_cents: number;
  discount_cents: number;
  loyalty_discount_cents: number;
  cash_discount_cents: number;
  amount_paid_cents: number;
}): number {
  return a.amount_cents - a.discount_cents - a.loyalty_discount_cents - a.cash_discount_cents - a.amount_paid_cents;
}
