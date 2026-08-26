import { NextRequest, NextResponse } from "next/server";
import { SERVICES } from "@/lib/services-data";
import { getAvailableSlots, DEFAULT_AVAILABILITY } from "@/lib/availability";
import { effectiveAppointmentEnd, CLASS_PADDING_MINUTES } from "@/lib/booking-conflicts";

/**
 * GET /api/availability?serviceId=xxx&date=YYYY-MM-DD
 * Returns available time slots for a service on a given AEST date.
 *
 * GET /api/availability?serviceId=xxx&dates=YYYY-MM-DD,YYYY-MM-DD,...
 * Batch mode: returns { availability: { [date]: string[] } } so the calendar
 * can determine which dates have zero slots without one request per date.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date");
  const datesParam = searchParams.get("dates");

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
      dates.map(async (d) => [d, await getSlotsForDate(service, d)] as const),
    );
    const availability: Record<string, string[]> = {};
    for (const [d, slots] of results) availability[d] = slots;
    return NextResponse.json({ availability });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date!)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const filtered = await getSlotsForDate(service, date!);
  return NextResponse.json({ slots: filtered });
}

async function getSlotsForDate(
  service: (typeof SERVICES)[number],
  date: string,
): Promise<string[]> {
  let existingBookings: { start: string; end: string }[] = [];
  let blockedPeriods: { start: string; end: string }[] = [];

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

      // Fetch confirmed/pending appointments for this date
      const { data: appts } = await supabase
        .from("appointments")
        .select("start_datetime, end_datetime, services(name)")
        .in("status", ["confirmed", "pending"])
        .gte("start_datetime", startUTC)
        .lt("start_datetime", endUTC);

      if (appts) {
        // Recompute each appointment's effective end from the service's
        // CURRENT duration + padding (not just the stored end_datetime,
        // which is frozen at booking time and can go stale if the service's
        // duration/padding is changed afterwards) so the widget never offers
        // a slot the server-side conflict check would reject.
        existingBookings = (appts as unknown as { start_datetime: string; end_datetime: string; services: { name: string } | null }[]).map((a) => ({
          start: new Intl.DateTimeFormat("en-AU", {
            timeZone: "Australia/Brisbane",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(a.start_datetime)),
          end: new Intl.DateTimeFormat("en-AU", {
            timeZone: "Australia/Brisbane",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(effectiveAppointmentEnd(a.start_datetime, a.end_datetime, a.services?.name)),
        }));
      }

      // Fetch blocked periods overlapping this date
      const { data: blocked } = await supabase
        .from("blocked_periods")
        .select("start_datetime, end_datetime")
        .lt("start_datetime", endUTC)
        .gt("end_datetime", startUTC);

      if (blocked) {
        blockedPeriods = blocked.map((b: { start_datetime: string; end_datetime: string }) => ({
          start: new Intl.DateTimeFormat("en-AU", {
            timeZone: "Australia/Brisbane",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(b.start_datetime)),
          end: new Intl.DateTimeFormat("en-AU", {
            timeZone: "Australia/Brisbane",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(b.end_datetime)),
        }));
      }

      // Fetch active class sessions that overlap this AEST date.
      // Query slightly before the day start to catch sessions that begin before AEST midnight
      // but whose duration + 30 min padding extends into the day (e.g. a late-evening class).
      const classQueryStart = new Date(new Date(startUTC).getTime() - 4 * 60 * 60 * 1000).toISOString();

      const { data: classSessions } = await supabase
        .from("class_sessions")
        .select("start_datetime, duration_minutes")
        .eq("active", true)
        .gte("start_datetime", classQueryStart)
        .lt("start_datetime", endUTC);

      if (classSessions) {
        for (const cs of classSessions as { start_datetime: string; duration_minutes: number }[]) {
          const sessionStart = new Date(cs.start_datetime);
          const sessionEndMs = sessionStart.getTime() + (cs.duration_minutes + CLASS_PADDING_MINUTES) * 60 * 1000;
          const sessionEnd   = new Date(sessionEndMs);

          blockedPeriods.push({
            start: new Intl.DateTimeFormat("en-AU", {
              timeZone: "Australia/Brisbane",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(sessionStart),
            end: new Intl.DateTimeFormat("en-AU", {
              timeZone: "Australia/Brisbane",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(sessionEnd),
          });
        }
      }
    }
  } catch {
    // Supabase not configured — return availability-only slots
  }

  const slots = getAvailableSlots(
    date,
    service.duration_minutes,
    service.padding_minutes,
    existingBookings,
    blockedPeriods,
    DEFAULT_AVAILABILITY,
  );

  // Filter out slots within 2 hours of now
  const now = new Date();
  const minBookingTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const [y, mo, d] = date.split("-").map(Number);
  const filtered = slots.filter((slot) => {
    const [h, m] = slot.split(":").map(Number);
    const slotUTC = new Date(Date.UTC(y, mo - 1, d, h - 10, m, 0));
    return slotUTC >= minBookingTime;
  });

  return filtered;
}
