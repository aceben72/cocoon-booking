import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRescheduleNotification, sendAppointmentCancellation, sendPendingPaymentCancellation } from "@/lib/notifications";
import { clearNewClientFlagIfReturning, onAppointmentCompleted } from "@/lib/appointment-completion";
import { bookingLengthMinutes } from "@/lib/booking-conflicts";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { date, time, notes } = body as { date?: string; time?: string; notes?: string };

  if (!date || !time) {
    return NextResponse.json({ error: "date and time are required" }, { status: 400 });
  }

  const db = supabase();

  // Fetch appointment to get service duration/padding + client details for notification
  const { data: existing, error: fetchErr } = await db
    .from("appointments")
    .select(`
      id, start_datetime,
      services ( name, duration_minutes, padding_minutes, category ),
      clients ( first_name, last_name, email, mobile, is_new_client )
    `)
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const svc = existing.services as unknown as { name: string; duration_minutes: number; padding_minutes: number; category: string } | null;
  const rescheduleClient = existing.clients as unknown as { first_name: string; last_name: string; email: string; mobile: string; is_new_client: boolean } | null;

  // Same total-slot-length rule used when the appointment was first created
  // (app/api/bookings/route.ts) so a reschedule doesn't shrink the blocked
  // window back down to bare duration_minutes.
  const totalMins = bookingLengthMinutes(
    {
      duration_minutes: svc?.duration_minutes ?? 60,
      padding_minutes: svc?.padding_minutes ?? 30,
      category: svc?.category ?? "",
    },
    !!rescheduleClient?.is_new_client,
  );

  const startISO = new Date(`${date}T${time}:00+10:00`).toISOString();
  const endISO   = new Date(new Date(startISO).getTime() + totalMins * 60_000).toISOString();

  const updateData: Record<string, unknown> = { start_datetime: startISO, end_datetime: endISO };
  if (notes !== undefined) updateData.notes = notes || null;

  const { error: updateErr } = await db
    .from("appointments")
    .update(updateData)
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Send rescheduled notification (fire-and-forget)
  const client = rescheduleClient;
  if (client?.email && client?.mobile) {
    sendRescheduleNotification({
      serviceName: svc?.name ?? "your appointment",
      newStartISO: startISO,
      client,
    }).catch(console.error);
  }

  return NextResponse.json({ id, startISO, endISO });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { status, expectedStatus } = body as { status?: string; expectedStatus?: string };

  const allowed = ["confirmed", "completed", "cancelled"];
  if (!status || !allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = supabase();

  // Pre-fetch appointment details needed for notifications
  const { data: apptDetails } = await db
    .from("appointments")
    .select(`
      start_datetime, status,
      services ( name, duration_minutes, category ),
      clients ( first_name, last_name, email, mobile, is_new_client )
    `)
    .eq("id", id)
    .single();

  // Guard against stale-data races: if the caller's UI was showing a status
  // that has since changed (e.g. a payment webhook just confirmed an
  // appointment that the admin's page still showed as pending_payment),
  // refuse the update instead of silently cancelling the wrong state.
  if (expectedStatus && apptDetails && apptDetails.status !== expectedStatus) {
    return NextResponse.json(
      { error: `Appointment status changed (now "${apptDetails.status}"), refresh and try again` },
      { status: 409 },
    );
  }

  let query = db
    .from("appointments")
    .update({ status })
    .eq("id", id);
  if (expectedStatus) {
    query = query.eq("status", expectedStatus);
  }

  const { data, error } = await query
    .select("id, status, client_id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Appointment status changed, refresh and try again" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (status === "confirmed" && data.client_id) {
    await clearNewClientFlagIfReturning(db, data.client_id, id);
  }
  if (status === "completed" && apptDetails?.status !== "completed") {
    await onAppointmentCompleted(db, id);
  }

  // Cancellation notifications to client
  if (status === "cancelled" && apptDetails) {
    const clientData = apptDetails.clients as unknown as { first_name: string; last_name: string; email: string; mobile: string } | null;
    const svcData    = apptDetails.services as unknown as { name: string; duration_minutes: number } | null;
    if (apptDetails.status === "pending_payment") {
      if (clientData && svcData?.name) {
        sendPendingPaymentCancellation({
          serviceName: svcData.name,
          startISO:    apptDetails.start_datetime,
          client:      clientData,
        }).catch(console.error);
      }
    } else if (clientData?.email && clientData?.mobile && svcData?.name) {
      sendAppointmentCancellation({
        serviceName: svcData.name,
        startISO:    apptDetails.start_datetime,
        client:      clientData,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ id: data.id, status: data.status });
}
