import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendClassBookingCancellation } from "@/lib/notifications";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// PATCH — cancel a single class booking
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; bookingId: string }> },
) {
  const { id: sessionId, bookingId } = await params;

  // Fetch booking + client + session in parallel
  const [bookingRes, sessionRes] = await Promise.all([
    supabase()
      .from("class_bookings")
      .select("id, status, clients(first_name, last_name, email, mobile)")
      .eq("id", bookingId)
      .eq("session_id", sessionId)
      .single(),
    supabase()
      .from("class_sessions")
      .select("title, start_datetime")
      .eq("id", sessionId)
      .single(),
  ]);

  if (bookingRes.error || !bookingRes.data) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (bookingRes.data.status === "cancelled") {
    return NextResponse.json({ error: "Booking is already cancelled" }, { status: 400 });
  }

  // Cancel the booking
  const { error: updateError } = await supabase()
    .from("class_bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Send cancellation notification (fire & forget)
  if (sessionRes.data) {
    const client = bookingRes.data.clients as unknown as { first_name: string; last_name: string; email: string; mobile: string } | null;
    if (client?.email) {
      sendClassBookingCancellation({
        className: sessionRes.data.title as string,
        startISO:  sessionRes.data.start_datetime as string,
        client,
      }).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}
