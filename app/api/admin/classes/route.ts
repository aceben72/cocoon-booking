import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET — list sessions
// With ?from=&to=: flat list for date range (used by appointments view + mobile calendar)
// Without params:  grouped { upcoming, past, cancelled } (used by Make-Up Classes admin tab)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  // ── Date-range mode: flat list with bookings ──────────────────────────────
  if (from || to) {
    let query = supabase()
      .from("class_sessions")
      .select(`
        id, class_type, title, start_datetime, duration_minutes, capacity, description, active,
        class_bookings(id, status, clients(first_name, last_name, email, mobile))
      `)
      .order("start_datetime", { ascending: true })
      .eq("active", true);

    if (from) {
      query = query.gte("start_datetime", new Date(from).toISOString());
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      query = query.lt("start_datetime", toDate.toISOString());
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  // ── Grouped mode: upcoming / past / cancelled ─────────────────────────────
  const now = new Date().toISOString();

  const [upcoming, past, cancelled] = await Promise.all([
    // Active upcoming sessions only
    supabase()
      .from("class_sessions_with_availability")
      .select("*")
      .eq("active", true)
      .gte("start_datetime", now)
      .order("start_datetime", { ascending: true }),
    // Past sessions (active or not — historical record)
    supabase()
      .from("class_sessions_with_availability")
      .select("*")
      .lt("start_datetime", now)
      .order("start_datetime", { ascending: false })
      .limit(50),
    // Cancelled upcoming sessions (active = false, start in future)
    supabase()
      .from("class_sessions_with_availability")
      .select("*")
      .eq("active", false)
      .gte("start_datetime", now)
      .order("start_datetime", { ascending: true }),
  ]);

  if (upcoming.error) return NextResponse.json({ error: upcoming.error.message }, { status: 500 });

  return NextResponse.json({
    upcoming:  upcoming.data  ?? [],
    past:      past.data      ?? [],
    cancelled: cancelled.data ?? [],
  });
}

// POST — create a new session
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { class_type, start_datetime, description, capacity } = body as {
    class_type?: string;
    start_datetime?: string;
    description?: string;
    capacity?: number;
  };

  if (!class_type || !start_datetime) {
    return NextResponse.json({ error: "class_type and start_datetime are required" }, { status: 400 });
  }

  const validTypes = ["masterclass", "mother_daughter"];
  if (!validTypes.includes(class_type)) {
    return NextResponse.json({ error: "Invalid class_type" }, { status: 400 });
  }

  const resolvedCapacity = capacity ?? 4;
  if (!Number.isInteger(resolvedCapacity) || resolvedCapacity < 1) {
    return NextResponse.json({ error: "Capacity must be a whole number of at least 1" }, { status: 400 });
  }

  const CLASS_TITLES: Record<string, string> = {
    masterclass:     "Make-Up Masterclass",
    mother_daughter: "Mother Daughter Make-Up Class",
  };

  const { data, error } = await supabase()
    .from("class_sessions")
    .insert({
      class_type,
      title:            CLASS_TITLES[class_type],
      start_datetime:   new Date(start_datetime).toISOString(),
      duration_minutes: 180,
      capacity:         resolvedCapacity,
      description:      description || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
