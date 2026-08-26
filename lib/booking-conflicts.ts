import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICES } from "@/lib/services-data";

// Group class sessions (masterclass/advanced_class/mother_daughter) block
// duration_minutes + this padding on the calendar. Kept here (not per-class-type)
// because it's the one value every write/read path needs to agree on.
export const CLASS_PADDING_MINUTES = 30;

/**
 * The effective end of an existing appointment's blocked window.
 *
 * appointments.end_datetime is computed once at booking time and stored —
 * it is NEVER recomputed later. If a service's duration_minutes or
 * padding_minutes is subsequently changed (e.g. the 17 Aug 2026 Professional
 * Make-Up Application extension), every appointment for that service booked
 * *before* the change keeps its old, now-too-short end_datetime forever,
 * silently shrinking its padding. Recomputing from the service's CURRENT
 * config and taking the max with the stored value closes that gap without
 * requiring a backfill of historical rows (which production-safety rules
 * forbid doing automatically anyway).
 */
export function effectiveAppointmentEnd(
  startISO: string,
  storedEndISO: string,
  serviceName: string | null | undefined,
): Date {
  const start = new Date(startISO).getTime();
  const storedEnd = new Date(storedEndISO).getTime();
  const service = serviceName ? SERVICES.find((s) => s.name === serviceName) : undefined;
  const recomputedEnd = service
    ? start + (service.duration_minutes + service.padding_minutes) * 60_000
    : storedEnd;
  return new Date(Math.max(storedEnd, recomputedEnd));
}

/**
 * Server-side check: does [startISO, endISO) overlap the blocked window of
 * any existing appointment (recomputed per effectiveAppointmentEnd above) or
 * any active group class session (duration + CLASS_PADDING_MINUTES)?
 *
 * This is the single source of truth for time-conflict validation and must
 * be called by every code path that writes a new appointment or class
 * session — the public booking widget, the admin manual-booking panel, and
 * class session creation (which backs the deep-linked class booking flow).
 */
export async function hasBookingConflict(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  opts: { excludeAppointmentId?: string; excludeClassSessionId?: string } = {},
): Promise<boolean> {
  const newStart = new Date(startISO).getTime();
  const newEnd = new Date(endISO).getTime();

  // Widen the query window well beyond [start,end) so we still catch an
  // existing booking that starts earlier but whose (possibly recomputed)
  // effective end extends into the requested slot.
  const queryStart = new Date(newStart - 24 * 60 * 60 * 1000).toISOString();
  const queryEnd = new Date(newEnd).toISOString();

  let apptQuery = supabase
    .from("appointments")
    .select("id, start_datetime, end_datetime, services(name)")
    .in("status", ["confirmed", "pending", "pending_payment"])
    .gte("start_datetime", queryStart)
    .lt("start_datetime", queryEnd);
  if (opts.excludeAppointmentId) {
    apptQuery = apptQuery.neq("id", opts.excludeAppointmentId);
  }
  const { data: appts } = await apptQuery;

  for (const a of (appts ?? []) as unknown as {
    start_datetime: string;
    end_datetime: string;
    services: { name: string } | null;
  }[]) {
    const start = new Date(a.start_datetime).getTime();
    const effectiveEnd = effectiveAppointmentEnd(a.start_datetime, a.end_datetime, a.services?.name).getTime();
    if (start < newEnd && effectiveEnd > newStart) return true;
  }

  let sessionQuery = supabase
    .from("class_sessions")
    .select("id, start_datetime, duration_minutes")
    .eq("active", true)
    .gte("start_datetime", queryStart)
    .lt("start_datetime", queryEnd);
  if (opts.excludeClassSessionId) {
    sessionQuery = sessionQuery.neq("id", opts.excludeClassSessionId);
  }
  const { data: sessions } = await sessionQuery;

  for (const cs of (sessions ?? []) as { start_datetime: string; duration_minutes: number }[]) {
    const start = new Date(cs.start_datetime).getTime();
    const effectiveEnd = start + (cs.duration_minutes + CLASS_PADDING_MINUTES) * 60_000;
    if (start < newEnd && effectiveEnd > newStart) return true;
  }

  return false;
}
