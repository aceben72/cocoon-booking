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
  servicePriceCents: number;      // services.price_cents (current card price)
  serviceCashPriceCents: number | null; // services.cash_price_cents (null = no cash price)
  loyaltyRewardDueCents: number;  // from getLoyaltyRewardForAppointment when due, else 0
}

export interface CompletionResult {
  /** Totals to store on the appointment. */
  cashDiscountCents: number;
  loyaltyDiscountCents: number;
  /** Owing before this payment, after all discounts. */
  balanceBeforeCents: number;
  /** Payment row to write, or null (not paid yet / nothing owing). */
  payment: { method: PaymentMethod; amountCents: number } | null;
  balanceAfterCents: number;
  /** Paid more than is owed after discounts (e.g. prepaid in full, then loyalty due) — refund this. */
  overpaidCents: number;
}

/**
 * The cash/PayID discount for this booking: card price − cash price, but only
 * while the booking was made at the current card price. A booking made before
 * the 1 Oct price change has amount_cents = the old price (which is today's
 * cash price), so amount_cents ≠ services.price_cents and no discount applies.
 */
export function cashDiscountAvailable(input: Pick<CompletionInput, "amountCents" | "servicePriceCents" | "serviceCashPriceCents">): number {
  if (input.serviceCashPriceCents == null) return 0;
  if (input.amountCents !== input.servicePriceCents) return 0;
  return Math.max(0, input.servicePriceCents - input.serviceCashPriceCents);
}

/**
 * What happens if Amanda taps `choice`. `otherAmountCents` is the "Other
 * amount" option (part payment); without it the whole balance is paid.
 * Throws if the other amount is not between 1 cent and the balance.
 */
export function computeCompletion(
  input: CompletionInput,
  choice: CompleteChoice,
  otherAmountCents?: number,
): CompletionResult {
  // Loyalty is independent of payment method; never applied twice.
  const loyalty = input.loyaltyDiscountCents > 0 ? input.loyaltyDiscountCents : Math.max(0, input.loyaltyRewardDueCents);

  const owingBeforeCash = input.amountCents - input.couponDiscountCents - loyalty - input.amountPaidCents;

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
    balanceBeforeCents: balanceBefore,
    payment,
    balanceAfterCents: balanceBefore - (payment?.amountCents ?? 0),
    overpaidCents: overpaid,
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

export type AdminBookingMode = "pay_on_day" | "payment_link" | "no_charge";

/**
 * Amounts for a booking Amanda makes in admin. Only "no charge" (or an
 * admin-only service like Treatment Plan Facial) is $0; every other booking
 * takes the service's card price. A payment-link booking gets a due loyalty
 * reward applied up front so the link never charges more than is owed.
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
