import { NextRequest, NextResponse } from "next/server";
import { SERVICES } from "@/lib/services-data";
import { getAvailableSlots, DEFAULT_AVAILABILITY } from "@/lib/availability";

/**
 * GET /api/availability?serviceId=xxx&date=YYYY-MM-DD
 * Returns available time slots for a service on a given AEST date.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date");

  if (!serviceId || !date) {
    return NextResponse.json({ error: "serviceId and date are required" }, { status: 400 });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

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
        .select("start_datetime, end_datetime")
        .in("status", ["confirmed", "pending"])
        .gte("start_datetime", startUTC)
        .lt("start_datetime", endUTC);

      if (appts) {
        existingBookings = appts.map((a: { start_datetime: string; end_datetime: string }) => ({
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
          }).format(new Date(a.end_datetime)),
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
        const CLASS_PADDING_MINUTES = 30;
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

  return NextResponse.json({ slots: filtered });
}
