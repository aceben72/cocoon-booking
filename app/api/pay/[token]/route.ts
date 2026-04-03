import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { SERVICES } from "@/lib/services-data";
import { sendAppointmentConfirmation } from "@/lib/notifications";

const DEPOSIT_CENTS = 5000;

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface RawAppointment {
  id: string;
  start_datetime: string;
  status: string;
  amount_cents: number;
  payment_link_token_expires_at: string;
  services: { name: string; category: string; duration_minutes: number } | null;
  clients: { first_name: string; last_name: string; email: string; mobile: string } | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const body = await request.json().catch(() => ({})) as {
    squarePaymentToken?: string;
    amountPaidCents?: number;
  };

  const { squarePaymentToken, amountPaidCents: rawAmount } = body;

  if (!squarePaymentToken) {
    return NextResponse.json({ error: "Payment token required" }, { status: 400 });
  }

  const db = supabase();

  // Look up appointment by token
  const { data: appt, error: apptErr } = await db
    .from("appointments")
    .select(`
      id, start_datetime, status, amount_cents, payment_link_token_expires_at,
      services ( name, category, duration_minutes ),
      clients ( first_name, last_name, email, mobile )
    `)
    .eq("payment_link_token", token)
    .single();

  if (apptErr || !appt) {
    return NextResponse.json({ error: "Payment link not found" }, { status: 404 });
  }

  const appointment = appt as unknown as RawAppointment;

  if (appointment.status !== "pending_payment") {
    return NextResponse.json({ error: "This booking is no longer awaiting payment" }, { status: 409 });
  }

  if (new Date(appointment.payment_link_token_expires_at) < new Date()) {
    return NextResponse.json({ error: "This payment link has expired" }, { status: 410 });
  }

  // Validate amountPaidCents against deposit rules
  const category = appointment.services?.category ?? "";
  const priceCents = appointment.amount_cents;
  const hasDepositOption = !["brow-treatments", "led-light-treatments"].includes(category);

  let amountPaidCents: number;
  if (hasDepositOption && typeof rawAmount === "number" && rawAmount === DEPOSIT_CENTS) {
    amountPaidCents = DEPOSIT_CENTS;
  } else {
    amountPaidCents = priceCents; // default to full payment
  }

  // Process Square payment
  const squareToken  = process.env.SQUARE_ACCESS_TOKEN;
  const squareLoc    = process.env.SQUARE_LOCATION_ID;
  const squareEnv    = process.env.SQUARE_ENVIRONMENT ?? "sandbox";
  let squarePaymentId: string | null = null;

  if (squareToken && squareLoc) {
    try {
      const { SquareClient, SquareEnvironment } = await import("square");
      const client = new SquareClient({
        token: squareToken,
        environment: squareEnv === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
      });

      const idempotencyKey = createHash("sha256")
        .update(`paylink|${token}|${amountPaidCents}`)
        .digest("hex")
        .slice(0, 40);

      const { payment } = await client.payments.create({
        sourceId: squarePaymentToken,
        idempotencyKey,
        amountMoney: { amount: BigInt(amountPaidCents), currency: "AUD" },
        locationId: squareLoc,
        buyerEmailAddress: appointment.clients?.email ?? undefined,
        note: `${appointment.services?.name} — payment link`,
      });

      squarePaymentId = payment?.id ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      return NextResponse.json({ error: `Payment failed: ${msg}` }, { status: 402 });
    }
  }

  // Update appointment: confirmed, clear token
  const { error: updateErr } = await db
    .from("appointments")
    .update({
      status: "confirmed",
      square_payment_id: squarePaymentId,
      amount_paid_cents: amountPaidCents,
      payment_link_token: null,
      payment_link_token_expires_at: null,
    })
    .eq("id", appointment.id);

  if (updateErr) {
    console.error("[pay/token] update failed:", updateErr);
    return NextResponse.json({ error: "Failed to confirm booking" }, { status: 500 });
  }

  // Send confirmation notifications (fire & forget)
  if (appointment.clients && appointment.services) {
    const localService = SERVICES.find((s) => s.name === appointment.services!.name);
    sendAppointmentConfirmation({
      serviceName: appointment.services.name,
      durationMinutes: appointment.services.duration_minutes,
      priceCents,
      amountPaidCents,
      startISO: appointment.start_datetime,
      client: {
        first_name: appointment.clients.first_name,
        last_name: appointment.clients.last_name,
        email: appointment.clients.email,
        mobile: appointment.clients.mobile,
      },
    }).catch(console.error);

    void localService; // suppress unused warning
  }

  return NextResponse.json({ success: true });
}
