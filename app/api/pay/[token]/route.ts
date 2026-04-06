import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
  client_id: string;
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
      id, client_id, start_datetime, status, amount_cents, payment_link_token_expires_at,
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

      const idempotencyKey = crypto.randomUUID().replace(/-/g, "").substring(0, 45);

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

  // ── Clear is_new_client if this is not their first confirmed appointment ──
  const { data: priorConfirmed } = await db
    .from("appointments")
    .select("id")
    .eq("client_id", appointment.client_id)
    .in("status", ["confirmed", "completed"])
    .neq("id", appointment.id)
    .limit(1);

  if (priorConfirmed && priorConfirmed.length > 0) {
    await db
      .from("clients")
      .update({ is_new_client: false })
      .eq("id", appointment.client_id);
  }

  // ── Send confirmation notifications ──────────────────────────────────────
  // Awaited before returning so Vercel does not freeze the execution context
  // before the outbound Resend/ClickSend requests complete.
  const clientData  = appt.clients  as unknown as RawAppointment["clients"];
  const serviceData = appt.services as unknown as RawAppointment["services"];

  console.log("[pay/token] notification gate — clientData:", JSON.stringify(clientData), "serviceData:", JSON.stringify(serviceData));

  if (clientData && serviceData) {
    console.log("[pay/token] sending confirmation notifications for appointment", appointment.id);
    await sendAppointmentConfirmation({
      serviceName: serviceData.name,
      durationMinutes: serviceData.duration_minutes,
      priceCents,
      amountPaidCents,
      startISO: appointment.start_datetime,
      client: {
        first_name: clientData.first_name,
        last_name: clientData.last_name,
        email: clientData.email,
        mobile: clientData.mobile,
      },
    }).catch((err) => console.error("[pay/token] confirmation notifications failed for appointment", appointment.id, err));
    console.log("[pay/token] confirmation notifications sent for appointment", appointment.id);
  } else {
    console.error("[pay/token] skipping notifications — missing client or service data. appt.id:", appointment.id, "clients:", JSON.stringify(appt.clients), "services:", JSON.stringify(appt.services));
  }

  return NextResponse.json({ success: true });
}
