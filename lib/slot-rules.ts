// Slot and clash rules shared by the public time list (GET /api/availability)
// and the submit-time clash check (hasBookingConflict in booking-conflicts.ts).
//
// Both sides MUST go through this file. On 8 Oct 2026 the time list filtered
// appointments by ["confirmed","pending"] while the submit check also counted
// "pending_payment", so the widget offered slots next to two unpaid admin
// bookings and a client was rejected four times in a row.
//
// No runtime imports, so `npm test` (node --test) can load it directly. The
// current service config is passed in as a lookup instead of importing SERVICES.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Appointment statuses that hold their time slot. */
export const BLOCKING_APPOINTMENT_STATUSES = ["confirmed", "pending", "pending_payment"] as const;

// Group class sessions (masterclass/advanced_class/mother_daughter) block
// duration_minutes + this padding on the calendar.
export const CLASS_PADDING_MINUTES = 30;

// New clients get an extra 15 min so the initial consultation doesn't push
// into the next booking. Mother & Daughter class is exempt.
export const NEW_CLIENT_EXTRA_PADDING_MINUTES = 15;

export const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;

/** Slots are offered on this grid from opening time. */
export const SLOT_STEP_MINUTES = 30;

export interface SlotService {
  duration_minutes: number;
  padding_minutes: number;
  category: string;
}

/** Minutes a new booking occupies: duration + padding (+15 for a new client). */
export function bookingLengthMinutes(service: SlotService, isNewClient: boolean): number {
  const extra = isNewClient && service.category !== "mother-daughter" ? NEW_CLIENT_EXTRA_PADDING_MINUTES : 0;
  return service.duration_minutes + service.padding_minutes + extra;
}

/** An occupied span in epoch milliseconds, end exclusive. */
export interface BusyWindow {
  startMs: number;
  endMs: number;
}

export type ServiceLookup = (serviceName: string) => Pick<SlotService, "duration_minutes" | "padding_minutes"> | undefined;

interface ApptRow {
  start_datetime: string;
  end_datetime: string;
  services: { name: string } | null;
}

interface ClassSessionRow {
  start_datetime: string;
  duration_minutes: number;
}

/**
 * The effective end of an existing appointment's blocked window.
 *
 * appointments.end_datetime is computed once at booking time and never
 * recomputed. If a service's duration/padding is later increased, older
 * bookings keep a too-short stored end, so take the max of the stored end and
 * one recomputed from the service's CURRENT config.
 */
export function effectiveAppointmentEndMs(
  startISO: string,
  storedEndISO: string,
  serviceName: string | null | undefined,
  lookup: ServiceLookup,
): number {
  const start = new Date(startISO).getTime();
  const storedEnd = new Date(storedEndISO).getTime();
  const service = serviceName ? lookup(serviceName) : undefined;
  const recomputedEnd = service
    ? start + (service.duration_minutes + service.padding_minutes) * 60_000
    : storedEnd;
  return Math.max(storedEnd, recomputedEnd);
}

export interface BusyQueryOptions {
  excludeAppointmentId?: string;
  excludeClassSessionId?: string;
  /**
   * Skip blocked periods. Only for admin creation paths, where Amanda may
   * deliberately book over her own block-out (the admin UI warns instead).
   */
  ignoreBlockedPeriods?: boolean;
}

/** A clash/availability query failed. Callers must fail closed, never treat it as "free". */
export class SlotCheckError extends Error {
  constructor(what: string, cause: unknown) {
    super(`Slot check failed reading ${what}`);
    this.name = "SlotCheckError";
    this.cause = cause;
  }
}

/**
 * Busy windows from every blocking appointment and active group class session
 * that STARTS in [fromISO, toISO), plus every blocked period OVERLAPPING it.
 * Callers widen fromISO (24h is plenty) so something that starts earlier but
 * runs into their range is still caught.
 *
 * Throws SlotCheckError if any query fails.
 */
export async function fetchBusyWindows(
  supabase: SupabaseClient,
  fromISO: string,
  toISO: string,
  lookup: ServiceLookup,
  opts: BusyQueryOptions = {},
): Promise<BusyWindow[]> {
  let apptQuery = supabase
    .from("appointments")
    .select("id, start_datetime, end_datetime, services(name)")
    .in("status", [...BLOCKING_APPOINTMENT_STATUSES])
    .gte("start_datetime", fromISO)
    .lt("start_datetime", toISO);
  if (opts.excludeAppointmentId) {
    apptQuery = apptQuery.neq("id", opts.excludeAppointmentId);
  }

  let sessionQuery = supabase
    .from("class_sessions")
    .select("id, start_datetime, duration_minutes")
    .eq("active", true)
    .gte("start_datetime", fromISO)
    .lt("start_datetime", toISO);
  if (opts.excludeClassSessionId) {
    sessionQuery = sessionQuery.neq("id", opts.excludeClassSessionId);
  }

  const blockedQuery = opts.ignoreBlockedPeriods
    ? Promise.resolve({ data: [], error: null })
    : supabase
        .from("blocked_periods")
        .select("start_datetime, end_datetime")
        .lt("start_datetime", toISO)
        .gt("end_datetime", fromISO);

  const [apptRes, sessionRes, blockedRes] = await Promise.all([apptQuery, sessionQuery, blockedQuery]);
  if (apptRes.error) throw new SlotCheckError("appointments", apptRes.error);
  if (sessionRes.error) throw new SlotCheckError("class sessions", sessionRes.error);
  if (blockedRes.error) throw new SlotCheckError("blocked periods", blockedRes.error);

  const windows: BusyWindow[] = [];
  for (const a of (apptRes.data ?? []) as unknown as ApptRow[]) {
    windows.push({
      startMs: new Date(a.start_datetime).getTime(),
      endMs: effectiveAppointmentEndMs(a.start_datetime, a.end_datetime, a.services?.name, lookup),
    });
  }
  for (const cs of (sessionRes.data ?? []) as ClassSessionRow[]) {
    const startMs = new Date(cs.start_datetime).getTime();
    windows.push({ startMs, endMs: startMs + (cs.duration_minutes + CLASS_PADDING_MINUTES) * 60_000 });
  }
  for (const bp of (blockedRes.data ?? []) as { start_datetime: string; end_datetime: string }[]) {
    windows.push({ startMs: new Date(bp.start_datetime).getTime(), endMs: new Date(bp.end_datetime).getTime() });
  }
  return windows;
}

/** Does [startMs, endMs) overlap any window? Touching ends don't count. */
export function overlapsAny(startMs: number, endMs: number, windows: BusyWindow[]): boolean {
  return windows.some((w) => w.startMs < endMs && startMs < w.endMs);
}

/**
 * Submit-time clash check: does [startISO, endISO) overlap any busy window?
 * Queries from 24h before the start so an earlier booking whose (possibly
 * recomputed) end runs into the slot is still caught.
 *
 * Throws SlotCheckError if the check couldn't be done; callers must reject.
 */
export async function hasConflict(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  lookup: ServiceLookup,
  opts: BusyQueryOptions = {},
): Promise<boolean> {
  const newStart = new Date(startISO).getTime();
  const newEnd = new Date(endISO).getTime();
  const queryStart = new Date(newStart - 24 * 60 * 60 * 1000).toISOString();
  const busy = await fetchBusyWindows(supabase, queryStart, new Date(newEnd).toISOString(), lookup, opts);
  return overlapsAny(newStart, newEnd, busy);
}

/** AEST (UTC+10, no DST in Queensland) date + "HH:MM" → epoch ms. */
export function aestToEpochMs(dateStr: string, hhmm: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h - 10, m, 0);
}

function minutesToTime(mins: number): string {
  return `${Math.floor(mins / 60).toString().padStart(2, "0")}:${(mins % 60).toString().padStart(2, "0")}`;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Start times ("HH:MM" AEST) to offer on `date`: on the 30-min grid from
 * opening, the whole booking (incl. padding) finishing by close, at least
 * MIN_NOTICE_MS after `nowMs`, and clear of every busy window.
 */
export function offeredSlots(p: {
  date: string;
  lengthMinutes: number;
  openTime: string;
  closeTime: string;
  busy: BusyWindow[];
  nowMs: number;
}): string[] {
  const open = timeToMinutes(p.openTime);
  const close = timeToMinutes(p.closeTime);
  const slots: string[] = [];
  for (let start = open; start + p.lengthMinutes <= close; start += SLOT_STEP_MINUTES) {
    const hhmm = minutesToTime(start);
    const startMs = aestToEpochMs(p.date, hhmm);
    const endMs = startMs + p.lengthMinutes * 60_000;
    if (startMs - p.nowMs < MIN_NOTICE_MS) continue;
    if (overlapsAny(startMs, endMs, p.busy)) continue;
    slots.push(hhmm);
  }
  return slots;
}

/**
 * The public time list for one AEST date: busy windows for the whole day
 * (same fetch as hasConflict, from 24h before so earlier bookings that run
 * into the day count) fed through offeredSlots.
 *
 * Throws SlotCheckError if the day couldn't be read; the caller must show an
 * error, not an empty or a wide-open day.
 */
export async function fetchTimeList(
  supabase: SupabaseClient,
  p: { date: string; lengthMinutes: number; openTime: string; closeTime: string; nowMs: number; lookup: ServiceLookup },
): Promise<string[]> {
  const dayStartMs = aestToEpochMs(p.date, "00:00");
  const from = new Date(dayStartMs - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(dayStartMs + 24 * 60 * 60 * 1000).toISOString();
  const busy = await fetchBusyWindows(supabase, from, to, p.lookup);
  return offeredSlots({ ...p, busy });
}
