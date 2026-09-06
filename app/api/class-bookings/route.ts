import { NextRequest, NextResponse, after } from "next/server";
import { normaliseMobile } from "@/lib/utils";
import { sendClassBookingConfirmation, sendAdminClassNotification } from "@/lib/notifications";
import { CLASS_TYPE_CONFIG } from "@/lib/class-types";
import { validateCouponForClass, calculateDiscount } from "@/lib/coupons";
import type { ClientDetailsForm, ClassType } from "@/types";

interface ClassBookingRequest {
  sessionId: string;
  client: ClientDetailsForm;
  squarePaymentToken: string;
  quantity?: number;
  couponCode?: string | null;
}

export async function POST(request: NextRequest) {
  let body: ClassBookingRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sessionId, client, squarePaymentToken, couponCode } = body;
  const quantity = body.quantity ?? 1;

  if (!sessionId || !client || !squarePaymentToken) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) {
    return NextResponse.json({ error: "Quantity must be between 1 and 4" }, { status: 400 });
  }

  if (couponCode && quantity !== 1) {
    return NextResponse.json(
      { error: "Discount codes can only be applied to single-ticket bookings." },
      { status: 400 },
    );
  }

  const mobile = normaliseMobile(client.mobile);
  if (!mobile) {
    return NextResponse.json({ error: "Invalid Australian mobile number" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Fetch session ─────────────────────────────────────────────────────────
  const { data: session, error: sessionError } = await supabase
    .from("class_sessions_with_availability")
    .select("*")
    .eq("id", sessionId)
    .eq("active", true)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Class session not found" }, { status: 404 });
  }

  const classConfig = CLASS_TYPE_CONFIG[session.class_type as ClassType];
  if (!classConfig) {
    return NextResponse.json({ error: "Unknown class type" }, { status: 500 });
  }
  const pricePerTicketCents = classConfig.priceCents;

  // ── Concurrency / spot check (before payment) ─────────────────────────────
  if ((session.spots_remaining as number) < quantity) {
    const remaining = session.spots_remaining as number;
    const msg = remaining === 0
      ? "Sorry, this class is now fully booked. Please go back and choose another session."
      : `Sorry, only ${remaining} spot${remaining === 1 ? "" : "s"} remain${remaining === 1 ? "s" : ""} — please reduce your ticket quantity.`;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const totalAmountCents = pricePerTicketCents * quantity;

  // ── Server-side coupon validation ─────────────────────────────────────────
  let couponId: string | null = null;
  let couponDiscountCents = 0;

  if (couponCode) {
    const couponResult = await validateCouponForClass(couponCode, totalAmountCents);
    if (!couponResult.valid || !couponResult.coupon) {
      return NextResponse.json({ error: `Discount code: ${couponResult.error}` }, { status: 400 });
    }
    couponId = couponResult.coupon.id;
    couponDiscountCents = calculateDiscount(couponResult.coupon, totalAmountCents);
  }

  const amountToChargeCents = Math.max(0, totalAmountCents - couponDiscountCents);

  // ── Square payment ────────────────────────────────────────────────────────
  let squarePaymentId: string | null = null;

  const squareToken    = process.env.SQUARE_ACCESS_TOKEN;
  const squareLocation = process.env.SQUARE_LOCATION_ID;
  const squareEnv      = process.env.SQUARE_ENVIRONMENT ?? "sandbox";

  // Only charge Square if there's a meaningful amount (>= 50 cents) — a
  // coupon can cover the full ticket price, in which case no card is charged.
  if (amountToChargeCents >= 50 && squarePaymentToken !== "NO_CHARGE") {
    if (squareToken && squareLocation) {
      try {
        const { SquareClient, SquareEnvironment } = await import("square");
        const squareClient = new SquareClient({
          token: squareToken,
          environment: squareEnv === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
        });

        const idempotencyKey = crypto.randomUUID().replace(/-/g, "").substring(0, 45);

        const ticketLabel = quantity === 1 ? "1 ticket" : `${quantity} tickets`;
        const { payment } = await squareClient.payments.create({
          sourceId: squarePaymentToken,
          idempotencyKey,
          amountMoney: { amount: BigInt(amountToChargeCents), currency: "AUD" },
          locationId: squareLocation,
          buyerEmailAddress: client.email,
          note: `${session.title} — ${ticketLabel} — ${new Date(session.start_datetime).toLocaleDateString("en-AU")}`,
        });

        squarePaymentId = payment?.id ?? null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Payment failed";
        return NextResponse.json({ error: `Payment failed: ${message}` }, { status: 402 });
      }
    }
  }

  // ── Upsert client ─────────────────────────────────────────────────────────
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id")
    .eq("email", client.email)
    .single();

  let clientId: string;

  if (existingClient) {
    clientId = existingClient.id;
  } else {
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        first_name: client.first_name,
        last_name: client.last_name,
        email: client.email,
        mobile,
        is_new_client: client.is_new_client,
        notes: client.notes || null,
      })
      .select("id")
      .single();

    if (clientError || !newClient) {
      console.error("[class-bookings] client insert failed:", clientError);
      return NextResponse.json(
        { error: `Failed to save client details: ${clientError?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    clientId = newClient.id;
  }

  // ── Final spot check (within same DB connection, minimises race window) ──
  const { data: freshSession } = await supabase
    .from("class_sessions_with_availability")
    .select("spots_remaining")
    .eq("id", sessionId)
    .single();

  if (!freshSession || (freshSession.spots_remaining as number) < quantity) {
    // Payment already taken — log for manual refund; return error
    console.error(
      `[class-bookings] race condition: session ${sessionId} has ${freshSession?.spots_remaining ?? 0} spots but needed ${quantity}. Payment: ${squarePaymentId}`,
    );
    return NextResponse.json(
      { error: "Sorry, this class just became fully booked. Please contact Amanda — your payment will be refunded." },
      { status: 409 },
    );
  }

  // ── Insert one booking record per ticket ──────────────────────────────────
  // (couponId/couponDiscountCents are only ever set when quantity === 1, so
  // there's never more than one row here when a coupon is involved.)
  const bookingRows = Array.from({ length: quantity }, () => ({
    session_id:        sessionId,
    client_id:         clientId,
    status:            "confirmed",
    square_payment_id: squarePaymentId,
    amount_cents:      pricePerTicketCents,
    coupon_id:         couponId,
    discount_cents:    couponDiscountCents,
  }));

  const { data: bookings, error: bookingError } = await supabase
    .from("class_bookings")
    .insert(bookingRows)
    .select("id");

  if (bookingError || !bookings || bookings.length === 0) {
    console.error("[class-bookings] booking insert failed:", bookingError);
    return NextResponse.json(
      { error: `Failed to create booking: ${bookingError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // ── Record coupon use ─────────────────────────────────────────────────────
  if (couponId && couponDiscountCents > 0) {
    await supabase.from("coupon_uses").insert({
      coupon_id:         couponId,
      class_booking_id:  bookings[0].id,
      discount_cents:    couponDiscountCents,
    });

    // Increment uses_count
    const { data: couponRow } = await supabase
      .from("coupons")
      .select("uses_count")
      .eq("id", couponId)
      .single();
    if (couponRow) {
      await supabase
        .from("coupons")
        .update({ uses_count: (couponRow.uses_count ?? 0) + 1 })
        .eq("id", couponId);
    }
  }

  // ── Refresh spots remaining ───────────────────────────────────────────────
  const { data: updated } = await supabase
    .from("class_sessions_with_availability")
    .select("spots_remaining")
    .eq("id", sessionId)
    .single();

  const spotsRemaining = (updated?.spots_remaining as number) ?? 0;

  // ── Send confirmation notifications (after response, guaranteed) ──────────
  after(() =>
    sendClassBookingConfirmation({
      className:       session.title as string,
      startISO:        session.start_datetime as string,
      durationMinutes: session.duration_minutes as number,
      amountCents:     amountToChargeCents,
      quantity,
      client:          { ...client, mobile },
    }).catch(console.error),
  );

  // Admin notification to Amanda
  after(() =>
    sendAdminClassNotification({
      className: session.title as string,
      startISO:  session.start_datetime as string,
      quantity,
      client:    { ...client, mobile },
    }).catch(console.error),
  );

  return NextResponse.json({
    bookingId:      bookings[0].id,
    session: {
      title:            session.title,
      start_datetime:   session.start_datetime,
      duration_minutes: session.duration_minutes,
    },
    spotsRemaining,
    amountCents: amountToChargeCents,
    discountCents: couponDiscountCents,
    quantity,
    client: {
      first_name: client.first_name,
      last_name:  client.last_name,
      email:      client.email,
    },
  });
}
