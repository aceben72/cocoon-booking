import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET /api/admin/conflict-check?start=<ISO>&end=<ISO>
 *
 * Checks whether a proposed time window overlaps with any existing
 * active appointments or blocked periods. Returns a summary so the
 * caller can show a non-blocking warning.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end   = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const startDate = new Date(start);
  const endDate   = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
    return NextResponse.json({ error: "Invalid start/end values" }, { status: 400 });
  }

  // Optional: exclude a specific ID from both tables (used when editing an existing record)
  const excludeId = searchParams.get("excludeId");

  const db = supabase();

  // Overlap condition: existing.start < proposed.end  AND  existing.end > proposed.start
  let apptQuery = db
    .from("appointments")
    .select("id, status")
    .in("status", ["confirmed", "pending", "pending_payment"])
    .lt("start_datetime", endDate.toISOString())
    .gt("end_datetime",   startDate.toISOString());
  if (excludeId) apptQuery = apptQuery.neq("id", excludeId);

  let bpQuery = db
    .from("blocked_periods")
    .select("id")
    .lt("start_datetime", endDate.toISOString())
    .gt("end_datetime",   startDate.toISOString());
  if (excludeId) bpQuery = bpQuery.neq("id", excludeId);

  const [apptResult, bpResult] = await Promise.all([apptQuery, bpQuery]);

  if (apptResult.error) {
    return NextResponse.json({ error: apptResult.error.message }, { status: 500 });
  }
  if (bpResult.error) {
    return NextResponse.json({ error: bpResult.error.message }, { status: 500 });
  }

  const appointmentCount  = (apptResult.data ?? []).length;
  const blockedPeriodCount = (bpResult.data ?? []).length;
  const conflict = appointmentCount > 0 || blockedPeriodCount > 0;

  return NextResponse.json({ conflict, appointmentCount, blockedPeriodCount });
}
