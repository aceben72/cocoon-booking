import { NextRequest, NextResponse } from "next/server";
import { SERVICES } from "@/lib/services-data";
import { openingHoursFor, DEFAULT_AVAILABILITY } from "@/lib/availability";
import { getBusyWindows, bookingLengthMinutes } from "@/lib/booking-conflicts";
import { offeredSlots, type BusyWindow } from "@/lib/slot-rules";

/**
 * GET /api/availability?serviceId=xxx&date=YYYY-MM-DD[&newClient=1]
 * Returns available time slots for a service on a given AEST date.
 *
 * GET /api/availability?serviceId=xxx&dates=YYYY-MM-DD,YYYY-MM-DD,...[&newClient=1]
 * Batch mode: returns { availability: { [date]: string[] } } so the calendar
 * can determine which dates have zero slots without one request per date.
 *
 * newClient=1 sizes each slot with the new-client consultation time, exactly
 * as POST /api/bookings will when the client ticks "first visit".
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date");
  const datesParam = searchParams.get("dates");
  const isNewClient = searchParams.get("newClient") === "1";

  if (!serviceId || (!date && !datesParam)) {
    return NextResponse.json({ error: "serviceId and date (or dates) are required" }, { status: 400 });
  }

  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (datesParam) {
    const dates = datesParam.split(",").map((d) => d.trim()).filter(Boolean);
    if (dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
      return NextResponse.json({ error: "dates must be YYYY-MM-DD" }, { status: 400 });
    }
    const results = await Promise.all(
      dates.map(async (d) => [d, await getSlotsForDate(service, d, isNewClient)] as const),
    );
    const availability: Record<string, string[]> = {};
    for (const [d, slots] of results) availability[d] = slots;
    return NextResponse.json({ availability });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date!)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const filtered = await getSlotsForDate(service, date!, isNewClient);
  return NextResponse.json({ slots: filtered });
}

async function getSlotsForDate(
  service: (typeof SERVICES)[number],
  date: string,
  isNewClient: boolean,
): Promise<string[]> {
  const hours = openingHoursFor(date, DEFAULT_AVAILABILITY);
  if (!hours) return [];

  let busy: BusyWindow[] = [];
  let blocked: BusyWindow[] = [];

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Date range in UTC: AEST date is UTC+10, so AEST 00:00 = UTC prev-day 14:00
      const [y, mo, d] = date.split("-").map(Number);
      const startUTC = new Date(Date.UTC(y, mo - 1, d, -10, 0, 0)).toISOString();
      const endUTC   = new Date(Date.UTC(y, mo - 1, d,  14, 0, 0)).toISOString();

      // Appointments and class sessions: the SAME fetch hasBookingConflict
      // uses (same statuses, same recomputed ends), widened 24h back to catch
      // anything that starts the day before and runs into this one.
      const busyFrom = new Date(Date.UTC(y, mo - 1, d, -34, 0, 0)).toISOString();
      busy = await getBusyWindows(supabase, busyFrom, endUTC);

      // Blocked periods overlapping this date
      const { data: blockedRows } = await supabase
        .from("blocked_periods")
        .select("start_datetime, end_datetime")
        .lt("start_datetime", endUTC)
        .gt("end_datetime", startUTC);

      blocked = (blockedRows ?? []).map((b: { start_datetime: string; end_datetime: string }) => ({
        startMs: new Date(b.start_datetime).getTime(),
        endMs: new Date(b.end_datetime).getTime(),
      }));
    }
  } catch {
    // Supabase not configured — return availability-only slots
  }

  return offeredSlots({
    date,
    lengthMinutes: bookingLengthMinutes(service, isNewClient),
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    busy,
    blocked,
    nowMs: Date.now(),
  });
}
