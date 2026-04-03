import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendRescheduleNotification } from "@/lib/notifications";

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

  const { data, error } = await supabase()
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
