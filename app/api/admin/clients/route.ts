import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/clients
// Returns all clients with aggregated appointment stats.
// Optional ?q= filters by first name, last name, or email (case-insensitive).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  // ── Fetch clients ─────────────────────────────────────────────────────────
  let clientQuery = supabase()
    .from("clients")
    .select("id, first_name, last_name, email, mobile, is_new_client, created_at")
    .order("created_at", { ascending: false });

  if (q) {
    clientQuery = clientQuery.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }

  const { data: clients, error: clientsErr } = await clientQuery;
  if (clientsErr) return NextResponse.json({ error: clientsErr.message }, { status: 500 });

  if (!clients || clients.length === 0) return NextResponse.json([]);

  // ── Fetch appointment stats for those clients ─────────────────────────────
  const clientIds = clients.map((c) => c.id);
  const { data: appts, error: apptsErr } = await supabase()
    .from("appointments")
    .select("client_id, start_datetime, amount_paid_cents, status")
    .in("client_id", clientIds);

  if (apptsErr) return NextResponse.json({ error: apptsErr.message }, { status: 500 });

  // ── Aggregate per client ──────────────────────────────────────────────────
  const stats = new Map<
    string,
    { firstVisit: string | null; lastVisit: string | null; totalVisits: number; totalSpentCents: number }
  >();

  for (const appt of appts ?? []) {
    let s = stats.get(appt.client_id);
    if (!s) {
      s = { firstVisit: null, lastVisit: null, totalVisits: 0, totalSpentCents: 0 };
      stats.set(appt.client_id, s);
    }
    if (!s.firstVisit || appt.start_datetime < s.firstVisit) s.firstVisit = appt.start_datetime;
    if (!s.lastVisit  || appt.start_datetime > s.lastVisit)  s.lastVisit  = appt.start_datetime;
    if (appt.status === "completed") {
      s.totalVisits++;
      s.totalSpentCents += appt.amount_paid_cents;
    }
  }

  const result = clients
    .map((c) => ({
      ...c,
      ...(stats.get(c.id) ?? {
        firstVisit: null,
        lastVisit: null,
        totalVisits: 0,
        totalSpentCents: 0,
      }),
    }))
    .sort((a, b) => {
      // Most recent visit descending; clients with no visits go to the end
      if (!a.lastVisit && !b.lastVisit) return 0;
      if (!a.lastVisit) return 1;
      if (!b.lastVisit) return -1;
      return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
    });

  return NextResponse.json(result);
}
