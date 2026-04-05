import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── POST /api/admin/intake/[id]/acknowledge ─────────────────────────────────
// Saves consultant signature and marks intake form as acknowledged.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = supabase();

  const body = await request.json().catch(() => null) as {
    consultantSignature?: string;
  } | null;

  if (!body?.consultantSignature) {
    return NextResponse.json({ error: "consultantSignature is required" }, { status: 400 });
  }

  // Look up the form
  const { data: form, error: formErr } = await db
    .from("intake_forms")
    .select("id, status")
    .eq("id", id)
    .single();

  if (formErr || !form) {
    return NextResponse.json({ error: "Intake form not found" }, { status: 404 });
  }

  if (form.status !== "submitted") {
    return NextResponse.json(
      { error: "Intake form must be in 'submitted' state to acknowledge" },
      { status: 409 },
    );
  }

  const { error: updateErr } = await db
    .from("intake_forms")
    .update({
      consultant_signature: body.consultantSignature,
      consultant_signed_at: new Date().toISOString(),
      status: "acknowledged",
    })
    .eq("id", id);

  if (updateErr) {
    console.error("[admin/intake/acknowledge] update failed:", updateErr);
    return NextResponse.json({ error: "Failed to acknowledge intake form" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
