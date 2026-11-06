import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentMethod } from "@/lib/complete-payment";

/**
 * The one way to record money against an appointment from app code:
 * record_appointment_payments() in supabase/migrations/admin_gift_card_deposit_2026_11.sql.
 * One transaction: optional gift card redemption (card row locked, balance
 * decremented, gift_card_redemptions row, appointments.gift_card_id, a
 * gift_card payment row) plus optional one-method payment, with the
 * amount_paid_cents optimistic lock. Never writes amount_paid_cents directly:
 * the payments trigger does.
 *
 * Used by online checkout (gift card part), admin "Deposit paid" / "Gift card"
 * bookings, and the Complete panel.
 */
export interface RecordPaymentsArgs {
  appointmentId: string;
  /** amount_paid_cents the caller saw; null skips the check (booking just created in this request). */
  expectedPaidCents: number | null;
  /** true = Complete: set discounts and status completed. false = take a payment before the appointment. */
  complete: boolean;
  cashDiscountCents?: number | null;
  loyaltyDiscountCents?: number | null;
  giftCard?: { code: string; amountCents: number } | null;
  /** card_square | cash | payid_bank; ignored when amountCents is 0. */
  method?: PaymentMethod | null;
  amountCents?: number;
  recordedBy: "admin" | "online";
  notes?: string | null;
}

export interface RecordPaymentsResult {
  ok: true;
  amountPaidCents: number;
  status: string;
  giftCard: { gift_card_id: string; code: string; amount_cents: number; remaining_value_cents: number } | null;
}

export interface RecordPaymentsError {
  ok: false;
  /** 400 = bad input or card problem (message is for Amanda), 409 = stale, 500 = other. */
  status: 400 | 409 | 500;
  error: string;
}

export async function recordAppointmentPayments(
  db: SupabaseClient,
  a: RecordPaymentsArgs,
): Promise<RecordPaymentsResult | RecordPaymentsError> {
  const { data, error } = await db.rpc("record_appointment_payments", {
    p_appointment_id: a.appointmentId,
    p_expected_paid_cents: a.expectedPaidCents,
    p_complete: a.complete,
    p_cash_discount_cents: a.cashDiscountCents ?? null,
    p_loyalty_discount_cents: a.loyaltyDiscountCents ?? null,
    p_gift_card_code: a.giftCard?.code ?? null,
    p_gift_card_amount_cents: a.giftCard?.amountCents ?? 0,
    p_method: a.amountCents ? a.method ?? null : null,
    p_amount_cents: a.amountCents ?? 0,
    p_recorded_by: a.recordedBy,
    p_notes: a.notes?.trim() || null,
  });
  if (error) {
    const status = error.code === "40001" ? 409 : error.code === "22023" ? 400 : 500;
    return { ok: false, status, error: error.message };
  }
  const d = data as { amount_paid_cents: number; status: string; gift_card: RecordPaymentsResult["giftCard"] };
  return { ok: true, amountPaidCents: d.amount_paid_cents, status: d.status, giftCard: d.gift_card ?? null };
}
