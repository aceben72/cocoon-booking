import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICES } from "@/lib/services-data";
import { fetchTimeList, hasConflict, type BusyQueryOptions, type ServiceLookup } from "@/lib/slot-rules";

// The rules themselves live in lib/slot-rules.ts (pure, so `npm test` can load
// it). Import them from here in app code.
export {
  BLOCKING_APPOINTMENT_STATUSES,
  CLASS_PADDING_MINUTES,
  SlotCheckError,
  bookingLengthMinutes,
} from "@/lib/slot-rules";

/** Current duration/padding for a service, by the name stored in the DB. */
export const currentServiceByName: ServiceLookup = (name) => SERVICES.find((s) => s.name === name);

/**
 * Offered start times for one AEST date. Reads the same busy windows
 * (appointments, class sessions, blocked periods) as hasBookingConflict, so
 * the time list never offers a slot the submit check would reject.
 * Throws SlotCheckError if the day couldn't be read.
 */
export function getTimeList(
  supabase: SupabaseClient,
  p: { date: string; lengthMinutes: number; openTime: string; closeTime: string; nowMs: number },
): Promise<string[]> {
  return fetchTimeList(supabase, { ...p, lookup: currentServiceByName });
}

/**
 * Server-side check: does [startISO, endISO) overlap the blocked window of
 * any blocking appointment (BLOCKING_APPOINTMENT_STATUSES, end recomputed from
 * the service's current config), any active group class session
 * (duration + CLASS_PADDING_MINUTES), or any blocked period (unless
 * opts.ignoreBlockedPeriods)?
 *
 * Throws SlotCheckError if the check couldn't be done. Callers must reject
 * the booking rather than let it through.
 *
 * This is the single source of truth for time-conflict validation and must
 * be called by every code path that writes a new appointment or class
 * session — the public booking widget, the admin manual-booking panel, and
 * class session creation (which backs the deep-linked class booking flow).
 */
export function hasBookingConflict(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  opts: BusyQueryOptions = {},
): Promise<boolean> {
  return hasConflict(supabase, startISO, endISO, currentServiceByName, opts);
}
