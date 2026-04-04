import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { SERVICES } from "@/lib/services-data";
import { aestToUTC, normaliseMobile } from "@/lib/utils";
import { validateGiftCard } from "@/lib/gift-cards";
import { validateCoupon, calculateDiscount } from "@/lib/coupons";
import type { ClientDetailsForm } from "@/types";

interface BookingRequest {
  serviceId: string;
  date: string;             // YYYY-MM-DD AEST
  time: string;             // HH:MM AEST
  client: ClientDetailsForm;
  squarePaymentToken: string;
  amountPaidCents?: number; // deposit or full; defaults to full price
  giftCardCode?: string | null;
  couponCode?: string | null;
}

export async function POST(request: NextRequest) {
  let body: BookingRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    serviceId,
    date,
    time,
    client,
    squarePaymentToken,
    amountPaidCents: rawAmountPaid,
    giftCardCode,
    couponCode,
  } = body;

  // Validate required fields
  if (!serviceId || !date || !time || !client || !squarePaymentToken) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Validate mobile
  const mobile = normaliseMobile(client.mobile);
  if (!mobile) {
    return NextResponse.json({ error: "Invalid Australian mobile number" }, { status: 400 });
  }

  // Compute UTC datetimes.
  // New clients get an extra 15 min added to the slot so the initial
  // consultation doesn't push into the next booking.
  const NEW_CLIENT_EXTRA_PADDING_MINUTES = 15;
  const startISO = aestToUTC(date, time);
  const totalMins =
    service.duration_minutes +
    service.padding_minutes +
    (client.is_new_client ? NEW_CLIENT_EXTRA_PADDING_MINUTES : 0);
  const endDate = new Date(new Date(startISO).getTime() + totalMins * 60 * 1000);
  const endISO = endDate.toISOString();

  // Check 2h minimum notice
  const now = new Date();
  if (new Date(startISO).getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Bookings require at least 2 hours notice" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Resolve service UUID ─────────────────────────────────────────────
  const localService = SERVICES.find((s) => s.id === serviceId);
  const { data: dbService, error: dbServiceError } = await supabase
    .from("services")
    .select("id")
    .eq("name", localService?.name ?? "")
    .single();

  if (dbServiceError || !dbService) {
    console.error("[bookings] service UUID lookup failed:", dbServiceError);
    return NextResponse.json(
      { error: `Service not found in database: ${dbServiceError?.message ?? "unknown"}` },
      { status: 404 },
    );
  }

  const serviceUUID = dbService.id as string;

  // ── Double-booking check ──────────────────────────────────────────────
  const { data: conflicts } = await supabase
    .from("appointments")
    .select("id")
    .in("status", ["confirmed", "pending", "pending_payment"])
    .lt("start_datetime", endISO)
    .gt("end_datetime", startISO);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: "This time slot is no longer available. Please choose another." },
      { status: 409 },
    );
  }

  // ── Server-side discount validation ──────────────────────────────────
  let couponId: string | null = null;
  let couponDiscountCents = 0;

  if (couponCode) {
    const couponResult = await validateCoupon(couponCode, service.category, service.price_cents);
    if (!couponResult.valid || !couponResult.coupon) {
      return NextResponse.json({ error: `Discount code: ${couponResult.error}` }, { status: 400 });
    }
    couponId = couponResult.coupon.id;
    couponDiscountCents = calculateDiscount(couponResult.coupon, service.price_cents);
  }

  let giftCardId: string | null = null;
  let giftCardAppliedCents = 0;

  if (giftCardCode) {
    const gcResult = await validateGiftCard(giftCardCode);
    if (!gcResult.valid || !gcResult.giftCard) {
      return NextResponse.json({ error: `Gift card: ${gcResult.error}` }, { status: 400 });
    }
    giftCardId = gcResult.giftCard.id;
    const afterCoupon = Math.max(0, service.price_cents - couponDiscountCents);
    giftCardAppliedCents = Math.min(gcResult.giftCard.remaining_value_cents, afterCoupon);
  }

  const totalDiscountCents = couponDiscountCents + giftCardAppliedCents;

  // Determine final amount to charge
  const depositAllowed = !["brow-treatments", "led-light-treatments"].includes(service.category);
  let amountPaidCents: number;

  if (
    depositAllowed &&
    typeof rawAmountPaid === "number" &&
    rawAmountPaid > 0 &&
    rawAmountPaid <= service.price_cents
  ) {
    // Client chose deposit — apply discounts
    amountPaidCents = Math.max(0, rawAmountPaid - totalDiscountCents);
  } else {
    // Full payment
    amountPaidCents = Math.max(0, service.price_cents - totalDiscountCents);
  }

  // ── Square payment ────────────────────────────────────────────────────
  let squarePaymentId: string | null = null;

  const squareToken = process.env.SQUARE_ACCESS_TOKEN;
  const squareLocationId = process.env.SQUARE_LOCATION_ID;
  const squareEnv = process.env.SQUARE_ENVIRONMENT ?? "sandbox";

  // Only charge Square if there's a meaningful amount (>= 50 cents)
  if (amountPaidCents >= 50 && squarePaymentToken !== "NO_CHARGE") {
    if (squareToken && squareLocationId) {
      try {
        const { SquareClient, SquareEnvironment } = await import("square");
        const squareClient = new SquareClient({
          token: squareToken,
          environment: squareEnv === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
        });

        const idempotencyKey = createHash("sha256")
          .update(`${serviceId}|${date}|${time}|${client.email}`)
          .digest("hex")
          .slice(0, 40);

        const { payment } = await squareClient.payments.create({
          sourceId: squarePaymentToken,
          idempotencyKey,
          amountMoney: {
            amount: BigInt(amountPaidCents),
            currency: "AUD",
          },
          locationId: squareLocationId,
          buyerEmailAddress: client.email,
          note: `${service.name} — ${date} ${time} AEST`,
        });

        squarePaymentId = payment?.id ?? null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Payment failed";
        return NextResponse.json({ error: `Payment failed: ${message}` }, { status: 402 });
      }
    }
  }

  // ── Upsert client ─────────────────────────────────────────────────────
  // Use ILIKE for case-insensitive email matching so that e.g. Jane@gmail.com
  // correctly resolves to an existing jane@gmail.com record.
  const { data: existingClient } = await supabase
    .from("clients")
    .select("id")
    .ilike("email", client.email)
    .maybeSingle();

  let clientId: string;

  if (existingClient) {
    // Returning client — keep their existing is_new_client value (never flip it
    // back to true), but refresh name/mobile in case they've changed.
    clientId = existingClient.id;
    await supabase
      .from("clients")
      .update({
        first_name: client.first_name,
        last_name: client.last_name,
        mobile,
      })
      .eq("id", clientId);
  } else {
    // Brand-new client — honour the is_new_client flag they submitted.
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
      console.error("[bookings] client insert failed:", clientError);
      return NextResponse.json(
        { error: `Failed to save client details: ${clientError?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    clientId = newClient.id;
  }

  // ── Create appointment ────────────────────────────────────────────────
  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .insert({
      service_id: serviceUUID,
      client_id: clientId,
      start_datetime: startISO,
      end_datetime: endISO,
      status: "confirmed",
      square_payment_id: squarePaymentId,
      amount_cents: service.price_cents,
      amount_paid_cents: amountPaidCents,
      discount_cents: totalDiscountCents,
      coupon_id: couponId,
      gift_card_id: giftCardId,
    })
    .select("id")
    .single();

  if (apptError || !appointment) {
    console.error("[bookings] appointment insert failed:", apptError);
    return NextResponse.json(
      { error: `Failed to create appointment: ${apptError?.message ?? "unknown"} (code: ${apptError?.code ?? "?"})` },
      { status: 500 },
    );
  }

  // ── Record coupon use ─────────────────────────────────────────────────
  if (couponId && couponDiscountCents > 0) {
    await supabase.from("coupon_uses").insert({
      coupon_id: couponId,
      appointment_id: appointment.id,
      discount_cents: couponDiscountCents,
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

  // ── Record gift card redemption ───────────────────────────────────────
  if (giftCardId && giftCardAppliedCents > 0) {
    await supabase.from("gift_card_redemptions").insert({
      gift_card_id: giftCardId,
      appointment_id: appointment.id,
      amount_cents: giftCardAppliedCents,
    });

    // Decrement remaining balance
    const { data: gcRow } = await supabase
      .from("gift_cards")
      .select("remaining_value_cents")
      .eq("id", giftCardId)
      .single();
    if (gcRow) {
      const newBalance = Math.max(0, gcRow.remaining_value_cents - giftCardAppliedCents);
      await supabase
        .from("gift_cards")
        .update({ remaining_value_cents: newBalance })
        .eq("id", giftCardId);
    }
  }

  // ── Send confirmation notifications (fire & forget) ───────────────────
  sendConfirmationNotifications({
    appointmentId: appointment.id,
    service,
    client: { ...client, mobile },
    startISO,
    amountPaidCents,
    isNewClient: !!client.is_new_client,
  }).catch(console.error);

  return NextResponse.json({
    appointmentId: appointment.id,
    service: { name: service.name, duration_minutes: service.duration_minutes },
    startISO,
    amountCents: service.price_cents,
    amountPaidCents,
    discountCents: totalDiscountCents,
    isNewClient: !!client.is_new_client,
    client: {
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
    },
  });
}

async function sendConfirmationNotifications(params: {
  appointmentId: string;
  service: { name: string; duration_minutes: number; price_cents: number };
  client: { first_name: string; last_name: string; email: string; mobile: string };
  startISO: string;
  amountPaidCents: number;
  isNewClient: boolean;
}) {
  const { service, client, startISO, amountPaidCents, isNewClient } = params;

  const displayDate = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(startISO));

  const displayTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(startISO));

  // Confirmation email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Cocoon Skin & Beauty <hello@cocoonskinandbeauty.com.au>",
        to: client.email,
        subject: "Your Cocoon appointment is confirmed ✨",
        html: buildConfirmationEmail({ client, service, displayDate, displayTime, amountPaidCents, isNewClient }),
      });
    } catch (err) {
      console.error("Resend error:", err);
    }
  }

  // Confirmation SMS via ClickSend
  const clicksendUser = process.env.CLICKSEND_USERNAME;
  const clicksendKey = process.env.CLICKSEND_API_KEY;
  if (clicksendUser && clicksendKey) {
    try {
      const smsBody = `Hi ${client.first_name}, your ${service.name} at Cocoon is confirmed for ${displayDate} at ${displayTime}. See you then! – Amanda`;
      const auth = Buffer.from(`${clicksendUser}:${clicksendKey}`).toString("base64");

      await fetch("https://rest.clicksend.com/v3/sms/send", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              body: smsBody,
              to: client.mobile,
              source: "Cocoon",
            },
          ],
        }),
      });
    } catch (err) {
      console.error("ClickSend error:", err);
    }
  }
}

function buildConfirmationEmail(params: {
  client: { first_name: string; last_name: string };
  service: { name: string; duration_minutes: number; price_cents: number };
  displayDate: string;
  displayTime: string;
  amountPaidCents: number;
  isNewClient: boolean;
}) {
  const { client, service, displayDate, displayTime, amountPaidCents, isNewClient } = params;
  const paidDisplay = amountPaidCents === 0
    ? "Covered by promotions"
    : `$${(amountPaidCents / 100).toFixed(0)}`;
  const duration = service.duration_minutes < 60
    ? `${service.duration_minutes} min`
    : `${Math.floor(service.duration_minutes / 60)} hr${service.duration_minutes % 60 ? ` ${service.duration_minutes % 60} min` : ""}`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f5f2;font-family:'Jost',Arial,sans-serif;font-weight:300;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5f2;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <!-- Header -->
        <tr>
          <td align="center" style="background:#044e77;padding:32px 24px;border-radius:12px 12px 0 0;">
            <img src="https://mcusercontent.com/644ef8c7fbae49e3b1826dda3/images/1b7a3cb7-18c0-682d-62bf-921900b53c86.png"
                 alt="Cocoon Skin & Beauty" height="48" style="display:block;">
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:40px 32px;border-radius:0 0 12px 12px;">
            <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
                       font-style:italic;color:#044e77;margin:0 0 8px;">
              You're confirmed! ✨
            </h1>
            <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
              Hi ${client.first_name}, we can't wait to see you.
            </p>

            <!-- Appointment summary -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8f5f2;border-radius:10px;padding:24px;margin-bottom:32px;">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Service</span><br>
                  <strong style="font-size:16px;color:#1a1a1a;">${service.name}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Date</span><br>
                  <strong style="font-size:16px;color:#1a1a1a;">${displayDate}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Time</span><br>
                  <strong style="font-size:16px;color:#1a1a1a;">${displayTime}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Duration</span><br>
                  <strong style="font-size:16px;color:#1a1a1a;">${duration}</strong>
                </td>
              </tr>
              <tr>
                <td>
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Amount Paid</span><br>
                  <strong style="font-size:16px;color:#044e77;">${paidDisplay}</strong>
                </td>
              </tr>
            </table>

            <!-- Location -->
            <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
              <strong style="color:#1a1a1a;">Location</strong><br>
              Cocoon Skin &amp; Beauty<br>
              16 Bunderoo Circuit, Pimpama QLD 4209
            </p>

            <!-- New client note -->
            ${isNewClient ? `
            <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
              As a first-time client, please allow an extra 15 minutes for your initial consultation with Amanda.
            </p>
            ` : ""}

            <!-- Cancellation policy -->
            <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
                      border-top:1px solid #f0ebe4;padding-top:20px;">
              Need to reschedule or cancel? Please contact Amanda at least 48 hours before your appointment.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:24px 0;">
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;
                      color:#b0a499;font-size:16px;margin:0;">
              Relax. Revive. Restore.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();
}
