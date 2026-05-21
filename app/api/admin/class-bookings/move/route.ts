import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendClassBookingMoved } from "@/lib/notifications";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST — move all class_bookings for a client+session to a different session
export async function POST(request: NextRequest) {
  let body: { class_booking_ids?: unknown; target_session_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { class_booking_ids, target_session_id } = body;

  if (
    !Array.isArray(class_booking_ids) ||
    class_booking_ids.length === 0 ||
    !class_booking_ids.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "class_booking_ids must be a non-empty array of strings" },
      { status: 400 },
    );
  }

  if (typeof target_session_id !== "string" || !target_session_id) {
    return NextResponse.json({ error: "target_session_id is required" }, { status: 400 });
  }

  const db = supabase();

  // ── Fetch the bookings being moved ─────────────────────────────────────────
  const { data: bookings, error: bookingsErr } = await db
    .from("class_bookings")
    .select("id, session_id, status, clients(first_name, last_name, email, mobile)")
    .in("id", class_booking_ids)
    .eq("status", "confirmed");

  if (bookingsErr) {
    return NextResponse.json({ error: bookingsErr.message }, { status: 500 });
  }
  if (!bookings || bookings.length === 0) {
    return NextResponse.json(
      { error: "No confirmed bookings found for the provided IDs" },
      { status: 404 },
    );
  }

  // Verify all bookings belong to the same source session
  const sourceSessionIds = [...new Set(bookings.map((b) => b.session_id as string))];
  if (sourceSessionIds.length > 1) {
    return NextResponse.json(
      { error: "All bookings must belong to the same source session" },
      { status: 400 },
    );
  }
  const sourceSessionId = sourceSessionIds[0];

  if (sourceSessionId === target_session_id) {
    return NextResponse.json(
      { error: "Target session is the same as the current session" },
      { status: 400 },
    );
  }

  // ── Fetch source session (for class_type validation) ──────────────────────
  const { data: sourceSession, error: sourceErr } = await db
    .from("class_sessions")
    .select("class_type, title")
    .eq("id", sourceSessionId)
    .single();

  if (sourceErr || !sourceSession) {
    return NextResponse.json({ error: "Source session not found" }, { status: 404 });
  }

  // ── Fetch target session ───────────────────────────────────────────────────
  const { data: targetSession, error: targetErr } = await db
    .from("class_sessions_with_availability")
    .select("id, class_type, title, start_datetime, spots_remaining, active")
    .eq("id", target_session_id)
    .single();

  if (targetErr || !targetSession) {
    return NextResponse.json({ error: "Target session not found" }, { status: 404 });
  }

  if (!targetSession.active) {
    return NextResponse.json(
      { error: "Target session is not active" },
      { status: 400 },
    );
  }

  if (targetSession.class_type !== sourceSession.class_type) {
    return NextResponse.json(
      { error: "Target session must be the same class type as the current session" },
      { status: 400 },
    );
  }

  const spotsNeeded = bookings.length;
  if ((targetSession.spots_remaining as number) < spotsNeeded) {
    return NextResponse.json(
      {
        error: `This session only has ${targetSession.spots_remaining} spot(s) available — not enough for ${spotsNeeded} ticket(s)`,
      },
      { status: 409 },
    );
  }

  // ── Move the bookings ──────────────────────────────────────────────────────
  const { error: updateError } = await db
    .from("class_bookings")
    .update({ session_id: target_session_id })
    .in("id", class_booking_ids)
    .eq("status", "confirmed");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // ── Send notifications ─────────────────────────────────────────────────────
  // Use the first booking's client details for the notification
  const client = bookings[0].clients as unknown as {
    first_name: string;
    last_name: string;
    email: string;
    mobile: string;
  } | null;

  if (client?.email) {
    sendClassBookingMoved({
      className:   targetSession.title as string,
      newStartISO: targetSession.start_datetime as string,
      client,
    }).catch((err) => console.error("[class-bookings/move] notification failed:", err));
  }

  return NextResponse.json({
    ok:   true,
    moved: bookings.length,
    targetSession: {
      id:             targetSession.id,
      title:          targetSession.title,
      start_datetime: targetSession.start_datetime,
    },
  });
}
