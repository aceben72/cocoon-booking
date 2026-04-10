import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "crypto";
import { SERVICES } from "@/lib/services-data";
import { aestToUTC, normaliseMobile } from "@/lib/utils";
import { sendPaymentRequest, sendAppointmentConfirmation } from "@/lib/notifications";

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
    noCharge?: boolean;
  };

  const { serviceId, date, time, firstName, lastName, email, mobile: rawMobile, noCharge } = body;

  if (!serviceId || !date || !time || !firstName || !lastName || !email || !rawMobile) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  // Validate service
  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  // Validate mobile
  const mobile = normaliseMobile(rawMobile);
  if (!mobile) {
    return NextResponse.json({ error: "Invalid Australian mobile number" }, { status: 400 });
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

  // Double-booking check (include pending_payment — slot is reserved)
  const { data: conflicts } = await db
    .from("appointments")
    .select("id")
    .in("status", ["confirmed", "pending", "pending_payment"])
    .lt("start_datetime", endISO)
    .gt("end_datetime", startISO);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      { error: "That time slot already has an existing booking." },
      { status: 409 },
    );
  }

  // Upsert client
  const { data: existingClient } = await db
    .from("clients")
    .select("id")
    .eq("email", email)
    .single();

  let clientId: string;

  if (existingClient) {
    clientId = existingClient.id as string;
  } else {
    const { data: newClient, error: clientErr } = await db
      .from("clients")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        mobile,
        is_new_client: true,
      })
      .select("id")
      .single();

    if (clientErr || !newClient) {
      return NextResponse.json(
        { error: `Failed to save client: ${clientErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    clientId = newClient.id as string;
  }

  const isNoCharge = noCharge === true || service.admin_only === true;

  // Build appointment insert payload
  const apptPayload = isNoCharge
    ? {
        service_id:       dbService.id,
        client_id:        clientId,
        start_datetime:   startISO,
        end_datetime:     endISO,
        status:           "confirmed",
        amount_cents:     0,
        amount_paid_cents: 0,
      }
    : (() => {
        const token    = randomUUID();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
        return {
          service_id:                      dbService.id,
          client_id:                       clientId,
          start_datetime:                  startISO,
          end_datetime:                    endISO,
          status:                          "pending_payment",
          amount_cents:                    service.price_cents,
          amount_paid_cents:               0,
          payment_link_token:              token,
          payment_link_token_expires_at:   expiresAt,
        };
      })();

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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (request.headers.get("origin") || "http://localhost:3000");

  // Create intake form for new clients (excluding make-up classes and no-charge/internal services)
  const INTAKE_EXCLUDED_SERVICES = ["Make-Up Class", "Mother Daughter Make-Up Class"];
  const isNewClient = !existingClient;
  let intakeFormUrl: string | null = null;
  if (isNewClient && !isNoCharge && !INTAKE_EXCLUDED_SERVICES.includes(service.name)) {
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

  if (isNoCharge) {
    // Confirmed immediately — send standard confirmation email/SMS
    sendAppointmentConfirmation({
      serviceName:     service.name,
      durationMinutes: service.duration_minutes,
      priceCents:      0,
      amountPaidCents: 0,
      startISO,
      intakeFormUrl,
      client: { first_name: firstName, last_name: lastName, email, mobile },
    }).catch(console.error);

    return NextResponse.json({
      appointmentId: appointment.id,
      service: service.name,
      startISO,
      noCharge: true,
    }, { status: 201 });
  }

  // Paid flow — send payment request
  const paymentUrl = `${appUrl}/pay/${appointment.payment_link_token}`;

  sendPaymentRequest({
    serviceName: service.name,
    startISO,
    paymentUrl,
    client: { first_name: firstName, last_name: lastName, email, mobile },
  }).catch(console.error);

  return NextResponse.json({
    appointmentId: appointment.id,
    paymentUrl,
    service: service.name,
    startISO,
  }, { status: 201 });
}
