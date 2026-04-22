import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRescheduleNotification, sendAppointmentCancellation } from "@/lib/notifications";

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

  // Fetch appointment to get service duration + client details for notification
  const { data: existing, error: fetchErr } = await db
    .from("appointments")
    .select(`
      id, start_datetime,
      services ( name, duration_minutes ),
      clients ( first_name, last_name, email, mobile )
    `)
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const svc = existing.services as unknown as { name: string; duration_minutes: number } | null;
  const durationMinutes = svc?.duration_minutes ?? 60;

  const startISO = new Date(`${date}T${time}:00+10:00`).toISOString();
  const endISO   = new Date(new Date(startISO).getTime() + durationMinutes * 60_000).toISOString();

  const updateData: Record<string, unknown> = { start_datetime: startISO, end_datetime: endISO };
  if (notes !== undefined) updateData.notes = notes || null;

  const { error: updateErr } = await db
    .from("appointments")
    .update(updateData)
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Send rescheduled notification (fire-and-forget)
  const client = existing.clients as unknown as { first_name: string; last_name: string; email: string; mobile: string } | null;
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
  const { status } = body as { status?: string };

  const allowed = ["confirmed", "completed", "cancelled"];
  if (!status || !allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = supabase();

  // Pre-fetch appointment details needed for notifications
  const { data: apptDetails } = await db
    .from("appointments")
    .select(`
      start_datetime,
      services ( name, duration_minutes ),
      clients ( first_name, last_name, email, mobile )
    `)
    .eq("id", id)
    .single();

  const { data, error } = await db
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .select("id, status, client_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clear is_new_client if this client now has more than one confirmed/completed appointment
  if ((status === "confirmed" || status === "completed") && data.client_id) {
    const { data: priorConfirmed } = await db
      .from("appointments")
      .select("id")
      .eq("client_id", data.client_id)
      .in("status", ["confirmed", "completed"])
      .neq("id", id)
      .limit(1);

    if (priorConfirmed && priorConfirmed.length > 0) {
      await db
        .from("clients")
        .update({ is_new_client: false })
        .eq("id", data.client_id);
    }
  }

  // Cancellation notifications to client
  if (status === "cancelled" && apptDetails) {
    const clientData = apptDetails.clients as unknown as { first_name: string; last_name: string; email: string; mobile: string } | null;
    const svcData    = apptDetails.services as unknown as { name: string; duration_minutes: number } | null;
    if (clientData?.email && clientData?.mobile && svcData?.name) {
      sendAppointmentCancellation({
        serviceName: svcData.name,
        startISO:    apptDetails.start_datetime,
        client:      clientData,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ id: data.id, status: data.status });
}
