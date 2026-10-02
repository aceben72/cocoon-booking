import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLoyaltyRewardForAppointment } from "@/lib/loyalty";
import { onAppointmentCompleted } from "@/lib/appointment-completion";
import {
  cashDiscountAvailable,
  computeCompletion,
  type CompleteChoice,
  type CompletionInput,
  type CompletionResult,
} from "@/lib/complete-payment";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const CHOICES: CompleteChoice[] = ["cash", "payid", "card", "not_paid"];

interface Loaded {
  status: string;
  serviceName: string;
  clientName: string;
  startISO: string;
  input: CompletionInput;
  payments: { id: string; amount_cents: number; method: string; paid_at: string; notes: string | null }[];
}

async function load(db: SupabaseClient, id: string): Promise<Loaded | null> {
  const { data: appt } = await db
    .from("appointments")
    .select(`
      id, status, start_datetime, amount_cents, discount_cents, loyalty_discount_cents, cash_discount_cents, amount_paid_cents,
      services ( name, price_cents, cash_price_cents ),
      clients ( first_name, last_name ),
      appointment_payments ( id, amount_cents, method, paid_at, notes )
    `)
    .eq("id", id)
    .single();
  if (!appt) return null;

  const svc = appt.services as unknown as { name: string; price_cents: number; cash_price_cents: number | null } | null;
  const client = appt.clients as unknown as { first_name: string; last_name: string } | null;

  // Loyalty (Prompt 2 rules) — a lookup failure must not block taking payment.
  let loyaltyRewardDueCents = 0;
  try {
    const reward = await getLoyaltyRewardForAppointment(db, id);
    if (reward.due) loyaltyRewardDueCents = reward.amountCents;
  } catch (err) {
    console.error("[admin/payment] loyalty lookup failed:", err);
  }

  return {
    status: appt.status as string,
    serviceName: svc?.name ?? "—",
    clientName: client ? `${client.first_name} ${client.last_name}` : "—",
    startISO: appt.start_datetime as string,
    input: {
      amountCents: appt.amount_cents as number,
      couponDiscountCents: appt.discount_cents as number,
      loyaltyDiscountCents: appt.loyalty_discount_cents as number,
      cashDiscountCents: appt.cash_discount_cents as number,
      amountPaidCents: appt.amount_paid_cents as number,
      servicePriceCents: svc?.price_cents ?? 0,
      serviceCashPriceCents: svc?.cash_price_cents ?? null,
      loyaltyRewardDueCents,
    },
    payments: ((appt.appointment_payments ?? []) as Loaded["payments"])
      .sort((a, b) => a.paid_at.localeCompare(b.paid_at)),
  };
}

// GET — breakdown for the Complete panel, plus what each button would do.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await load(supabase(), id);
  if (!loaded) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  const options = Object.fromEntries(
    CHOICES.map((c) => [c, computeCompletion(loaded.input, c)]),
  ) as Record<CompleteChoice, CompletionResult>;

  return NextResponse.json({
    status: loaded.status,
    serviceName: loaded.serviceName,
    clientName: loaded.clientName,
    startISO: loaded.startISO,
    ...loaded.input,
    cashDiscountAvailableCents: cashDiscountAvailable(loaded.input),
    payments: loaded.payments,
    options,
  });
}

// POST — Amanda tapped a button. Recomputes server-side and writes it in one
// transaction (record_appointment_payment). Never charges a card — "Paid card"
// records a payment already taken on the studio Square terminal.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    choice?: CompleteChoice;
    otherAmountCents?: number;
    expectedPaidCents?: number;
    notes?: string;
  };

  if (!body.choice || !CHOICES.includes(body.choice)) {
    return NextResponse.json({ error: "Invalid choice" }, { status: 400 });
  }
  if (typeof body.expectedPaidCents !== "number") {
    return NextResponse.json({ error: "expectedPaidCents is required" }, { status: 400 });
  }

  const db = supabase();
  const loaded = await load(db, id);
  if (!loaded) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (loaded.status === "cancelled") {
    return NextResponse.json({ error: "This appointment is cancelled" }, { status: 409 });
  }
  if (loaded.input.amountPaidCents !== body.expectedPaidCents) {
    return NextResponse.json({ error: "Payments on this appointment changed — refresh and try again" }, { status: 409 });
  }

  let result: CompletionResult;
  try {
    result = computeCompletion(loaded.input, body.choice, body.otherAmountCents);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid amount" }, { status: 400 });
  }

  const { error } = await db.rpc("record_appointment_payment", {
    p_appointment_id: id,
    p_expected_paid_cents: body.expectedPaidCents,
    p_cash_discount_cents: result.cashDiscountCents,
    p_loyalty_discount_cents: result.loyaltyDiscountCents,
    p_method: result.payment?.method ?? "cash",
    p_amount_cents: result.payment?.amountCents ?? 0,
    p_recorded_by: "admin",
    p_notes: body.notes?.trim() || null,
  });
  if (error) {
    const stale = error.code === "40001";
    return NextResponse.json({ error: error.message }, { status: stale ? 409 : 500 });
  }

  if (loaded.status !== "completed") {
    await onAppointmentCompleted(db, id);
  }

  return NextResponse.json({ success: true, ...result });
}
