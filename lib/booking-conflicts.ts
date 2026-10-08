import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICES } from "@/lib/services-data";
import { fetchBusyWindows, hasConflict, type BusyWindow, type ServiceLookup } from "@/lib/slot-rules";

// The rules themselves live in lib/slot-rules.ts (pure, so `npm test` can load
// it). Import them from here in app code.
export {
  BLOCKING_APPOINTMENT_STATUSES,
  CLASS_PADDING_MINUTES,
  NEW_CLIENT_EXTRA_PADDING_MINUTES,
  bookingLengthMinutes,
} from "@/lib/slot-rules";

/** Current duration/padding for a service, by the name stored in the DB. */
export const currentServiceByName: ServiceLookup = (name) => SERVICES.find((s) => s.name === name);

/**
 * Busy windows (blocking appointments + active class sessions) starting in
 * [fromISO, toISO). The time list and hasBookingConflict both read through
 * this, so they always agree on what's occupied.
 */
export function getBusyWindows(
  supabase: SupabaseClient,
  fromISO: string,
  toISO: string,
  opts: { excludeAppointmentId?: string; excludeClassSessionId?: string } = {},
): Promise<BusyWindow[]> {
  return fetchBusyWindows(supabase, fromISO, toISO, currentServiceByName, opts);
}

/**
 * Server-side check: does [startISO, endISO) overlap the blocked window of
 * any blocking appointment (BLOCKING_APPOINTMENT_STATUSES, end recomputed from
 * the service's current config) or any active group class session
 * (duration + CLASS_PADDING_MINUTES)?
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
  opts: { excludeAppointmentId?: string; excludeClassSessionId?: string } = {},
): Promise<boolean> {
  return hasConflict(supabase, startISO, endISO, currentServiceByName, opts);
}
