import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── GET /api/intake/[token] ─────────────────────────────────────────────────
// Returns intake form metadata + client name for the form page.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const db = supabase();

  const { data, error } = await db
    .from("intake_forms")
    .select(`
      id, status, expires_at,
      appointments ( start_datetime, services ( name ) ),
      clients ( first_name, last_name )
    `)
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Intake form not found" }, { status: 404 });
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "This intake form link has expired" }, { status: 410 });
  }

  if (data.status !== "pending") {
    return NextResponse.json({ error: "This intake form has already been submitted" }, { status: 409 });
  }

  return NextResponse.json({
    id: data.id,
    status: data.status,
    expiresAt: data.expires_at,
    appointment: data.appointments,
    client: data.clients,
  });
}

// ── POST /api/intake/[token] ────────────────────────────────────────────────
// Saves form responses + signature, marks as submitted, notifies Amanda.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const db = supabase();

  const body = await request.json().catch(() => null) as {
    responses?: Record<string, unknown>;
    clientSignature?: string;
  } | null;

  if (!body?.responses || !body.clientSignature) {
    return NextResponse.json({ error: "responses and clientSignature are required" }, { status: 400 });
  }

  // Look up the form
  const { data: form, error: formErr } = await db
    .from("intake_forms")
    .select(`
      id, status, expires_at, appointment_id,
      appointments ( start_datetime, services ( name ) ),
      clients ( first_name, last_name )
    `)
    .eq("token", token)
    .single();

  if (formErr || !form) {
    return NextResponse.json({ error: "Intake form not found" }, { status: 404 });
  }

  if (new Date(form.expires_at) < new Date()) {
    return NextResponse.json({ error: "This intake form link has expired" }, { status: 410 });
  }

  if (form.status !== "pending") {
    return NextResponse.json({ error: "This intake form has already been submitted" }, { status: 409 });
  }

  // Save responses + signature
  const { error: updateErr } = await db
    .from("intake_forms")
    .update({
      responses: body.responses,
      client_signature: body.clientSignature,
      client_signed_at: new Date().toISOString(),
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", form.id);

  if (updateErr) {
    console.error("[intake/token] update failed:", updateErr);
    return NextResponse.json({ error: "Failed to save intake form" }, { status: 500 });
  }

  // Notify Amanda (fire & forget)
  const appointment = form.appointments as unknown as {
    start_datetime: string;
    services: { name: string } | null;
  } | null;
  const client = form.clients as unknown as { first_name: string; last_name: string } | null;

  if (appointment && client) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const adminUrl = `${appUrl}/admin/intake/${form.id}`;
    const { sendIntakeFormNotification } = await import("@/lib/notifications");
    sendIntakeFormNotification({
      clientName: `${client.first_name} ${client.last_name}`,
      appointmentISO: appointment.start_datetime,
      serviceName: appointment.services?.name ?? "Facial",
      intakeAdminUrl: adminUrl,
    }).catch((err) => console.error("[intake/token] Amanda notification failed:", err));
  }

  return NextResponse.json({ success: true });
}
