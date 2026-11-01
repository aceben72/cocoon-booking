import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidEmail, normaliseSmsMobile } from "@/lib/utils";

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

// PATCH /api/admin/clients/[id]
// Updates the client's notes, loyalty exclusion and/or contact details
// (first_name, last_name, email, mobile) — only the fields sent.
// Reminders and notifications read clients.mobile / clients.email directly,
// so fixing them here fixes every future send.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    notes?: string | null;
    exclude_from_loyalty?: boolean;
    first_name?: unknown;
    last_name?: unknown;
    email?: unknown;
    mobile?: unknown;
  };

  const update: {
    notes?: string | null;
    exclude_from_loyalty?: boolean;
    first_name?: string;
    last_name?: string;
    email?: string;
    mobile?: string | null;
  } = {};
  if ("notes" in body) update.notes = body.notes ?? null;
  if (typeof body.exclude_from_loyalty === "boolean") update.exclude_from_loyalty = body.exclude_from_loyalty;

  for (const key of ["first_name", "last_name"] as const) {
    if (!(key in body)) continue;
    const value = typeof body[key] === "string" ? body[key].trim() : "";
    if (!value) {
      return NextResponse.json(
        { error: `${key === "first_name" ? "First" : "Last"} name can't be empty` },
        { status: 400 },
      );
    }
    update[key] = value;
  }

  if ("email" in body) {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    update.email = email;
  }

  // Mobile: blank clears it; anything else must be an AU mobile (04…),
  // stored as +614XXXXXXXX like every other mobile in the table.
  if ("mobile" in body) {
    const raw = typeof body.mobile === "string" ? body.mobile.trim() : "";
    if (!raw) {
      update.mobile = null;
    } else {
      const mobile = normaliseSmsMobile(raw);
      if (!mobile) {
        return NextResponse.json(
          { error: "Enter a valid Australian mobile (e.g. 0412 345 678)" },
          { status: 400 },
        );
      }
      update.mobile = mobile;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = supabase();

  // Bookings match clients by email (case-insensitive), so two clients
  // sharing one would merge their history. Escape ILIKE wildcards.
  if (update.email) {
    const pattern = update.email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: clash, error: clashErr } = await db
      .from("clients")
      .select("id, first_name, last_name")
      .ilike("email", pattern)
      .neq("id", id)
      .limit(1)
      .maybeSingle();
    if (clashErr) {
      return NextResponse.json({ error: "Couldn't check that email. Please try again." }, { status: 503 });
    }
    if (clash) {
      return NextResponse.json(
        { error: `${clash.first_name} ${clash.last_name} already uses that email` },
        { status: 409 },
      );
    }
  }

  const { data, error } = await db
    .from("clients")
    .update(update)
    .eq("id", id)
    .select("id, first_name, last_name, email, mobile")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, client: data });
}
