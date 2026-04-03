import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/clients/[id]
// Returns the full client record, all their appointments (with service + promo codes),
// and all their class bookings (with session details).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [clientRes, apptsRes, classBookingsRes] = await Promise.all([
    supabase()
      .from("clients")
      .select("id, first_name, last_name, email, mobile, is_new_client, notes, created_at")
      .eq("id", id)
      .single(),

    supabase()
      .from("appointments")
      .select(`
        id, start_datetime, end_datetime, status,
        amount_cents, amount_paid_cents, discount_cents, notes, created_at,
        services ( name, duration_minutes ),
        gift_cards ( code ),
        coupons ( code )
      `)
      .eq("client_id", id)
      .order("start_datetime", { ascending: false }),

    supabase()
      .from("class_bookings")
      .select(`
        id, status, amount_cents, created_at,
        class_sessions ( id, title, class_type, start_datetime, duration_minutes )
      `)
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (clientRes.error) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json({
    client:        clientRes.data,
    appointments:  apptsRes.data  ?? [],
    classBookings: classBookingsRes.data ?? [],
  });
}
