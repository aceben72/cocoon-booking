import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendClassBookingCancellation } from "@/lib/notifications";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET — session detail with all bookings
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [sessionRes, bookingsRes] = await Promise.all([
    supabase()
      .from("class_sessions_with_availability")
      .select("*")
      .eq("id", id)
      .single(),
    supabase()
      .from("class_bookings")
      .select("id, status, amount_cents, square_payment_id, created_at, clients(first_name, last_name, email, mobile)")
      .eq("session_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (sessionRes.error) return NextResponse.json({ error: sessionRes.error.message }, { status: 404 });

  return NextResponse.json({
    session:  sessionRes.data,
    bookings: bookingsRes.data ?? [],
  });
}

// PATCH — cancel the session (action: "cancel") or edit its fields (action: "edit")
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    action?: string;
    capacity?: number;
    start_datetime?: string;
    description?: string;
  };

  // ── Edit session fields ───────────────────────────────────────────────────
  if (body.action === "edit") {
    const updates: Record<string, unknown> = {};

    if (body.start_datetime !== undefined) {
      const dt = new Date(body.start_datetime);
      if (isNaN(dt.getTime())) {
        return NextResponse.json({ error: "Invalid start_datetime" }, { status: 400 });
      }
      updates.start_datetime = dt.toISOString();
    }

    if (body.capacity !== undefined) {
      if (!Number.isInteger(body.capacity) || body.capacity < 1) {
        return NextResponse.json({ error: "Capacity must be a whole number of at least 1" }, { status: 400 });
      }

      // Prevent reducing capacity below current confirmed booking count
      const { count } = await supabase()
        .from("class_bookings")
        .select("id", { count: "exact", head: true })
        .eq("session_id", id)
        .eq("status", "confirmed");

      const confirmedCount = count ?? 0;
      if (body.capacity < confirmedCount) {
        return NextResponse.json(
          { error: `Cannot set capacity to ${body.capacity} — there are already ${confirmedCount} confirmed booking(s).` },
          { status: 409 },
        );
      }

      updates.capacity = body.capacity;
    }

    if (body.description !== undefined) {
      updates.description = body.description || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase()
      .from("class_sessions")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Return updated session with availability
    const { data: updated } = await supabase()
      .from("class_sessions_with_availability")
      .select("*")
      .eq("id", id)
      .single();

    return NextResponse.json({ ok: true, session: updated ?? data });
  }

  // ── Cancel session (default / action: "cancel") ───────────────────────────
  const { data: session, error: sessionError } = await supabase()
    .from("class_sessions")
    .select("title, start_datetime")
    .eq("id", id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: bookings } = await supabase()
    .from("class_bookings")
    .select("id, clients(first_name, last_name, email, mobile)")
    .eq("session_id", id)
    .eq("status", "confirmed");

  await Promise.all([
    supabase().from("class_sessions").update({ active: false }).eq("id", id),
    supabase().from("class_bookings").update({ status: "cancelled" }).eq("session_id", id).eq("status", "confirmed"),
  ]);

  for (const booking of bookings ?? []) {
    const client = booking.clients as unknown as { first_name: string; last_name: string; email: string; mobile: string } | null;
    if (client?.email) {
      sendClassBookingCancellation({
        className: session.title as string,
        startISO:  session.start_datetime as string,
        client,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true, cancelledCount: (bookings ?? []).length });
}
