import { NextRequest, NextResponse } from "next/server";
import { SERVICES } from "@/lib/services-data";
import { openingHoursFor, DEFAULT_AVAILABILITY } from "@/lib/availability";
import { getTimeList, bookingLengthMinutes } from "@/lib/booking-conflicts";

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
    let results: (readonly [string, string[]])[];
    try {
      results = await Promise.all(
        dates.map(async (d) => [d, await getSlotsForDate(service, d, isNewClient)] as const),
      );
    } catch (err) {
      return slotsUnavailable(err);
    }
    const availability: Record<string, string[]> = {};
    for (const [d, slots] of results) availability[d] = slots;
    return NextResponse.json({ availability });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date!)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const slots = await getSlotsForDate(service, date!, isNewClient);
    return NextResponse.json({ slots });
  } catch (err) {
    return slotsUnavailable(err);
  }
}

/**
 * The day couldn't be read. Fail closed: an error, never an empty day (looks
 * fully booked) or a wide-open one (offers slots the submit check may reject).
 */
function slotsUnavailable(err: unknown) {
  console.error("[availability] slot lookup failed:", err);
  return NextResponse.json(
    { error: "We couldn't load available times just now. Please try again." },
    { status: 503 },
  );
}

async function getSlotsForDate(
  service: (typeof SERVICES)[number],
  date: string,
  isNewClient: boolean,
): Promise<string[]> {
  const hours = openingHoursFor(date, DEFAULT_AVAILABILITY);
  if (!hours) return [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Database not configured");

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Appointments, class sessions and blocked periods: the SAME fetch
  // hasBookingConflict uses, so a slot shown here passes the submit check.
  return getTimeList(supabase, {
    date,
    lengthMinutes: bookingLengthMinutes(service, isNewClient),
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    nowMs: Date.now(),
  });
}
