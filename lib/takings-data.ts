import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateTakings, quarterBoundsUTC, type Quarter, type TakingsEntry } from "./takings";

/**
 * Takings for a quarter: appointment payments (by paid_at) plus group class
 * bookings (always paid by Square online, at booking time). Read-only.
 * Gift card and facial package SALES are Square income at the time of sale
 * and aren't in this app's payment records — use Square for those.
 */
export async function loadTakings(db: SupabaseClient, quarter: Quarter) {
  const { startISO, endISO } = quarterBoundsUTC(quarter);

  const [{ data: payments, error: payErr }, { data: classes, error: classErr }] = await Promise.all([
    db.from("appointment_payments")
      .select("amount_cents, method, paid_at")
      .gte("paid_at", startISO)
      .lt("paid_at", endISO),
    db.from("class_bookings")
      .select("amount_cents, discount_cents, created_at")
      .not("square_payment_id", "is", null)
      .neq("status", "cancelled")
      .gte("created_at", startISO)
      .lt("created_at", endISO),
  ]);
  if (payErr || classErr) throw new Error((payErr ?? classErr)!.message);

  const entries: TakingsEntry[] = [
    ...(payments ?? []).map((p) => ({
      paidISO: p.paid_at as string,
      amountCents: p.amount_cents as number,
      method: p.method as string,
    })),
    ...(classes ?? []).map((c) => ({
      paidISO: c.created_at as string,
      amountCents: (c.amount_cents as number) - ((c.discount_cents as number) ?? 0),
      method: "class_card",
    })),
  ].filter((e) => e.amountCents > 0);

  return aggregateTakings(entries);
}

/** Earliest takings date we have, for the quarter selector. */
export async function firstTakingsISO(db: SupabaseClient): Promise<string | null> {
  const [{ data: p }, { data: c }] = await Promise.all([
    db.from("appointment_payments").select("paid_at").order("paid_at", { ascending: true }).limit(1).maybeSingle(),
    db.from("class_bookings").select("created_at").order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const dates = [p?.paid_at as string | undefined, c?.created_at as string | undefined].filter(Boolean) as string[];
  return dates.length ? dates.sort()[0] : null;
}
