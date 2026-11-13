import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "crypto";
import { SERVICES } from "@/lib/services-data";
import { aestToUTC, normaliseAuMobile } from "@/lib/utils";
import { findClientMatch, findOrCreateClient, mailchimpEmailFor } from "@/lib/client-lookup";
import { sendPaymentRequest, sendAppointmentConfirmation, sendAdminBookingNotification, tagMailchimpFacialBooked } from "@/lib/notifications";
import { hasBookingConflict } from "@/lib/booking-conflicts";
import {
  adminBookingAmounts,
  adminBookingPayment,
  ADMIN_BOOKING_MODES,
  type AdminBookingMode,
  type DepositMethod,
} from "@/lib/complete-payment";
import { recordAppointmentPayments } from "@/lib/appointment-payments";
import { validateGiftCard } from "@/lib/gift-cards";
import { getRewardForNewBooking } from "@/lib/loyalty";
import { bookingPriceCents, isMakeupLesson, lessonAttendeeRows, normaliseExtraDaughters } from "@/lib/makeup-lessons";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    serviceId?: string;
    date?: string;   // YYYY-MM-DD AEST
    time?: string;   // HH:MM AEST
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    mode?: AdminBookingMode;
    noCharge?: boolean; // legacy (cached admin pages): true = no_charge, otherwise payment_link
    extraDaughters?: number; // Mother & Daughter only, 0–2
    // deposit_paid / gift_card only:
    paidAmountCents?: number;     // whole dollars, in cents
    depositMethod?: DepositMethod; // deposit_paid: card | cash (cash or PayID) | gift_card
    giftCardCode?: string;        // gift_card, or deposit_paid by gift card
  };

  const { serviceId, date, time, firstName, lastName, email, mobile: rawMobile, noCharge } = body;
  if (body.mode !== undefined && !ADMIN_BOOKING_MODES.includes(body.mode)) {
    return NextResponse.json({ error: "Invalid booking type" }, { status: 400 });
  }
  const mode: AdminBookingMode = body.mode ?? (noCharge ? "no_charge" : "payment_link");

  if (!serviceId || !date || !time || !firstName || !lastName || !email || !rawMobile) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  // Validate service
  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  // Validate mobile
  const mobile = normaliseAuMobile(rawMobile);
  if (!mobile) {
    return NextResponse.json({ error: "Invalid Australian mobile number" }, { status: 400 });
  }

  const extraDaughters = normaliseExtraDaughters(service.name, body.extraDaughters);

  const takesPaymentNow = (mode === "deposit_paid" || mode === "gift_card") && service.admin_only !== true;
  const usesGiftCard = takesPaymentNow && (mode === "gift_card" || body.depositMethod === "gift_card");
  if (takesPaymentNow && mode === "deposit_paid" && !["card", "cash", "gift_card"].includes(body.depositMethod ?? "")) {
    return NextResponse.json({ error: "Choose how the deposit was paid" }, { status: 400 });
  }

  // Gift card checked before anything is saved; the redemption itself re-checks
  // under a row lock, so a card used in another tab meanwhile is still caught.
  let giftCardRemainingCents = 0;
  let giftCardCode: string | null = null;
  if (usesGiftCard) {
    if (!body.giftCardCode?.trim()) {
      return NextResponse.json({ error: "Enter or choose a gift card" }, { status: 400 });
    }
    const gc = await validateGiftCard(body.giftCardCode);
    if (!gc.valid || !gc.giftCard) {
      return NextResponse.json({ error: `Gift card: ${gc.error}` }, { status: 400 });
    }
    giftCardRemainingCents = gc.giftCard.remaining_value_cents;
    giftCardCode = gc.giftCard.code;
  }

  // Compute UTC datetimes
  const startISO = aestToUTC(date, time);
  const totalMins = service.duration_minutes + service.padding_minutes;
  const endISO = new Date(new Date(startISO).getTime() + totalMins * 60_000).toISOString();

  const db = supabase();

  // Resolve service UUID from database
  const { data: dbService, error: svcErr } = await db
    .from("services")
    .select("id")
    .eq("name", service.name)
    .single();

  if (svcErr || !dbService) {
    return NextResponse.json(
      { error: `Service not found in database: ${svcErr?.message ?? "unknown"}` },
      { status: 404 },
    );
  }

  // Double-booking check (include pending_payment — slot is reserved).
  // Blocked periods are skipped: Amanda may book over her own block-out
  // (the admin form warns via /api/admin/conflict-check instead).
  let clash: boolean;
  try {
    clash = await hasBookingConflict(db, startISO, endISO, { ignoreBlockedPeriods: true });
  } catch (err) {
    console.error("[admin/bookings] clash check failed:", err);
    return NextResponse.json({ error: "Couldn't check for clashes. Please try again." }, { status: 503 });
  }
  if (clash) {
    return NextResponse.json(
      { error: "That time slot already has an existing booking." },
      { status: 409 },
    );
  }

  // Existing client? Same rules as every booking (lib/client-lookup.ts):
  // email, else a single mobile + first-name match. A new one is saved
  // below, once the payment checks out.
  let existingClient: { id: string } | null = null;
  try {
    const match = await findClientMatch(db, { email, firstName, mobile });
    existingClient = match ? { id: match.clientId } : null;
  } catch (err) {
    console.error("[admin/bookings] client lookup failed:", err);
    return NextResponse.json({ error: "Couldn't look up the client. Please try again." }, { status: 503 });
  }

  // Loyalty: a payment-link booking gets a due reward up front so the link
  // never charges more than is owed. Pay-on-the-day bookings show the reward
  // as due and it's applied at Complete.
  // Deposit-paid / gift-card bookings look it up too, only to stop the amount
  // paid now exceeding what will be owed once the reward comes off at Complete.
  let loyaltyRewardDueCents = 0;
  if (mode === "payment_link" || takesPaymentNow) {
    try {
      loyaltyRewardDueCents = await getRewardForNewBooking(db, existingClient ? (existingClient.id as string) : null, dbService.id as string, startISO);
    } catch (err) {
      console.error("[admin/bookings] loyalty lookup failed:", err);
    }
  }

  // Price comes from the service (lib/services-data.ts, same as online
  // booking). Only "no charge" and admin-only services are $0.
  const priceCents = bookingPriceCents(service, extraDaughters);
  const amounts = adminBookingAmounts({
    mode,
    priceCents,
    adminOnly: service.admin_only === true,
    loyaltyRewardDueCents: mode === "payment_link" ? loyaltyRewardDueCents : 0,
  });

  // What's being paid now (deposit / gift card), validated before saving.
  let paidNow: { method: string; amountCents: number } | null = null;
  if (takesPaymentNow) {
    try {
      paidNow = adminBookingPayment({
        mode,
        priceCents,
        loyaltyRewardDueCents,
        amountCents: body.paidAmountCents,
        depositMethod: body.depositMethod,
        giftCardRemainingCents,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid amount" }, { status: 400 });
    }
  }
  const isNoCharge = amounts.amountCents === 0;
  const isPaymentLink = amounts.status === "pending_payment";

  let clientMatch: Awaited<ReturnType<typeof findOrCreateClient>>;
  try {
    clientMatch = await findOrCreateClient(db, {
      firstName,
      lastName,
      email,
      mobile,
      isNewClient: true,
    });
  } catch (clientErr) {
    return NextResponse.json(
      { error: `Failed to save client: ${clientErr instanceof Error ? clientErr.message : "unknown"}` },
      { status: 500 },
    );
  }
  const clientId = clientMatch.clientId;

  // Build appointment insert payload
  const apptPayload = {
    service_id:             dbService.id,
    client_id:              clientId,
    start_datetime:         startISO,
    end_datetime:           endISO,
    status:                 amounts.status,
    amount_cents:           amounts.amountCents,
    extra_daughters:        extraDaughters,
    amount_paid_cents:      0,
    loyalty_discount_cents: amounts.loyaltyDiscountCents,
    ...(isPaymentLink
      ? {
          payment_link_token:            randomUUID(),
          payment_link_token_expires_at: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        }
      : {}),
  };

  const { data: appointment, error: apptErr } = await db
    .from("appointments")
    .insert(apptPayload)
    .select("id, payment_link_token")
    .single();

  if (apptErr || !appointment) {
    return NextResponse.json(
      { error: `Failed to create booking: ${apptErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // Lesson head count for the checklist (levels unknown for admin bookings).
  if (isMakeupLesson(service.name)) {
    const { error: attErr } = await db.from("appointment_attendees").insert(
      lessonAttendeeRows(service.name, { extraDaughters }).map((r) => ({ ...r, appointment_id: appointment.id })),
    );
    if (attErr) console.error("[admin/bookings] attendee insert failed:", appointment.id, attErr);
  }

  // ── Deposit / gift card taken now ────────────────────────────────────
  // One transaction (record_appointment_payments): gift card redemption and/or
  // a payment row, recorded_by admin. If it fails the booking still stands,
  // confirmed with nothing paid, and Amanda is told to record it again.
  let amountPaidCents = 0;
  let paymentError: string | null = null;
  if (paidNow) {
    const isGift = paidNow.method === "gift_card";
    const r = await recordAppointmentPayments(db, {
      appointmentId: appointment.id,
      expectedPaidCents: 0,
      complete: false,
      giftCard: isGift ? { code: giftCardCode!, amountCents: paidNow.amountCents } : null,
      method: isGift ? null : (paidNow.method as "card_square" | "cash"),
      amountCents: isGift ? 0 : paidNow.amountCents,
      recordedBy: "admin",
      notes: mode === "deposit_paid" ? "Deposit taken in studio" : null,
    });
    if (r.ok) {
      amountPaidCents = r.amountPaidCents;
    } else {
      paymentError = r.error;
      console.error("[admin/bookings] PAYMENT NOT RECORDED — booking saved:", appointment.id, paidNow, r.error);
    }
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (request.headers.get("origin") || "http://localhost:3000");

  // Create intake form for new clients (excluding make-up classes and no-charge/internal services)
  const isNewClient = clientMatch.matchedBy === "created";
  let intakeFormUrl: string | null = null;
  if (isNewClient && !isNoCharge && !isMakeupLesson(service.name)) {
    try {
      const intakeToken    = randomBytes(32).toString("hex");
      const intakeExpiresAt = new Date(new Date(startISO).getTime() + 4 * 60 * 60 * 1000).toISOString();
      const { error: intakeErr } = await db.from("intake_forms").insert({
        appointment_id: appointment.id,
        client_id:      clientId,
        token:          intakeToken,
        expires_at:     intakeExpiresAt,
        status:         "pending",
      });
      if (intakeErr) {
        console.error("[admin/bookings] intake form insert failed:", intakeErr);
      } else {
        intakeFormUrl = `${appUrl}/intake/${intakeToken}`;
      }
    } catch (intakeEx) {
      console.error("[admin/bookings] intake form insert threw:", intakeEx);
    }
  }

  // ── Mailchimp: tag facial-booked on creation ─────────────────────────
  // Matched by mobile + first name → tag her existing (stored) email.
  const mailchimpEmail = mailchimpEmailFor(clientMatch, email);
  if (service.category === "facials" && mailchimpEmail) {
    after(() =>
      tagMailchimpFacialBooked({
        email: mailchimpEmail,
        firstName,
        lastName,
      }).catch((err) => console.error("[admin/bookings] mailchimp facial-booked tag failed:", err)),
    );
  }

  if (!isPaymentLink) {
    // Confirmed immediately (no charge, pay on the day, deposit paid, gift card)
    // — send standard confirmation email/SMS, showing anything already paid.
    after(() =>
      sendAppointmentConfirmation({
        serviceName:     service.name,
        durationMinutes: service.duration_minutes,
        priceCents:      amounts.amountCents,
        amountPaidCents,
        startISO,
        intakeFormUrl,
        isNewClient:     false,
        client: { first_name: firstName, last_name: lastName, email, mobile },
      }).catch(console.error),
    );

    // Admin notification to Amanda
    after(() =>
      sendAdminBookingNotification({
        serviceName:     service.name,
        durationMinutes: service.duration_minutes,
        startISO,
        isNewClient,
        notes:           null,
        client:          { first_name: firstName, last_name: lastName, email, mobile },
      }).catch(console.error),
    );

    return NextResponse.json({
      appointmentId: appointment.id,
      service: service.name,
      startISO,
      noCharge: isNoCharge,
      mode,
      amountPaidCents,
      priceCents: amounts.amountCents,
      paymentError,
    }, { status: 201 });
  }

  // Paid flow — send payment request
  const paymentUrl = `${appUrl}/pay/${appointment.payment_link_token}`;

  after(() =>
    sendPaymentRequest({
      serviceName: service.name,
      startISO,
      paymentUrl,
      client: { first_name: firstName, last_name: lastName, email, mobile },
    }).catch(console.error),
  );

  return NextResponse.json({
    appointmentId: appointment.id,
    paymentUrl,
    service: service.name,
    startISO,
  }, { status: 201 });
}
