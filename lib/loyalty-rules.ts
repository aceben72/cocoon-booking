/**
 * Loyalty reward rules — $50 off the 4th Indulge, Opulence or Lifting Code
 * facial when the client has completed 3 within 6 months.
 *
 * Pure logic only (no imports) so it can be unit-tested with `node --test`.
 * Data fetching lives in lib/loyalty.ts.
 */

export const LOYALTY_REWARD_CENTS = 5000;
/** Completed qualifying facials needed before the next one is discounted. */
export const LOYALTY_FACIALS_REQUIRED = 3;
export const LOYALTY_WINDOW_MONTHS = 6;

/**
 * Qualifying services — the single source of truth. `slug` is the id in
 * lib/services-data.ts (booking flow); `dbId` is the services table UUID
 * (appointments.service_id).
 */
export const LOYALTY_SERVICES = [
  { slug: "indulge-facial", dbId: "82488878-f180-4de6-a257-3ab6c8e83893" },
  { slug: "opulence-facial", dbId: "0e83c613-14e1-4b7e-886f-e7c4553f161c" },
  { slug: "lifting-code-facial", dbId: "687ac4ad-5ed7-494c-836c-20d48439f2f7" },
] as const;

export function isLoyaltyServiceSlug(slug: string): boolean {
  return LOYALTY_SERVICES.some((s) => s.slug === slug);
}

export function isLoyaltyServiceDbId(id: string): boolean {
  return LOYALTY_SERVICES.some((s) => s.dbId === id);
}

export const LOYALTY_OFFER_TEXT =
  "Loyalty reward: enjoy $50 off your 4th Indulge, Opulence or Lifting Code facial when you book 4 within 6 months.";
export const LOYALTY_SMALL_PRINT =
  "Applies to completed Indulge, Opulence and Lifting Code facials only. Cancelled or missed appointments don't count.";

export interface LoyaltyAppointment {
  id: string;
  serviceId: string;        // services table UUID
  startISO: string;
  status: string;           // pending_payment | confirmed | completed | cancelled
  loyaltyDiscountCents: number;
  paidViaPackage: boolean;  // has a facial_package_redemptions row
}

export interface LoyaltyStatus {
  excluded: boolean;
  /** Completed qualifying facials in the current window. */
  count: number;
  /** Brisbane date (YYYY-MM-DD) of the earliest counted facial, or null. */
  windowStart: string | null;
  /** True if a qualifying booking on the as-of date gets the reward. */
  rewardDue: boolean;
  /**
   * Last date (inclusive, YYYY-MM-DD) the 4th facial can fall on and still get
   * the reward, assuming no counted facial drops out first. Null when count is 0.
   */
  completeBy: string | null;
  /** Start of the latest non-cancelled reward appointment (the reset point). */
  lastRewardISO: string | null;
  countedAppointmentIds: string[];
}

/** Brisbane calendar date (UTC+10, no DST) of an ISO timestamp. */
export function brisbaneDate(iso: string | Date): string {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime() + 10 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Add calendar months to a YYYY-MM-DD date, clamping to month end (31 Aug + 6 → 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/**
 * Loyalty status for one client as at `asOf` (for a booking: its start time).
 *
 * Counted = qualifying service, status 'completed', not paid by a facial
 * package, not itself a reward, after the last reward use, and on or after
 * (asOf − 6 months). The window anchors on the earliest counted facial; older
 * ones drop off as asOf moves forward, so the window slides.
 */
export function computeLoyaltyStatus(
  appointments: LoyaltyAppointment[],
  opts: { excluded: boolean; asOf: Date | string },
): LoyaltyStatus {
  const empty: LoyaltyStatus = {
    excluded: opts.excluded,
    count: 0,
    windowStart: null,
    rewardDue: false,
    completeBy: null,
    lastRewardISO: null,
    countedAppointmentIds: [],
  };
  if (opts.excluded) return empty;

  const lastRewardISO = appointments
    .filter((a) => a.loyaltyDiscountCents > 0 && a.status !== "cancelled")
    .map((a) => a.startISO)
    .sort()
    .at(-1) ?? null;
  const lastRewardMs = lastRewardISO ? new Date(lastRewardISO).getTime() : null;

  const targetDate = brisbaneDate(opts.asOf);

  const counted = appointments
    .filter(
      (a) =>
        isLoyaltyServiceDbId(a.serviceId) &&
        a.status === "completed" &&
        !a.paidViaPackage &&
        a.loyaltyDiscountCents === 0 &&
        (lastRewardMs === null || new Date(a.startISO).getTime() > lastRewardMs) &&
        brisbaneDate(a.startISO) <= targetDate &&
        addMonths(brisbaneDate(a.startISO), LOYALTY_WINDOW_MONTHS) >= targetDate,
    )
    .sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime());

  const count = counted.length;
  const windowStart = count > 0 ? brisbaneDate(counted[0].startISO) : null;
  const rewardDue = count >= LOYALTY_FACIALS_REQUIRED;
  // Once due, the reward lapses when fewer than 3 remain in the window, i.e.
  // 6 months after the 3rd most recent counted facial.
  const completeBy = rewardDue
    ? addMonths(brisbaneDate(counted[count - LOYALTY_FACIALS_REQUIRED].startISO), LOYALTY_WINDOW_MONTHS)
    : windowStart
      ? addMonths(windowStart, LOYALTY_WINDOW_MONTHS)
      : null;

  return {
    excluded: false,
    count,
    windowStart,
    rewardDue,
    completeBy,
    lastRewardISO,
    countedAppointmentIds: counted.map((a) => a.id),
  };
}

/** Statuses of a booking that hasn't happened (or hasn't been closed off) yet. */
const OPEN_STATUSES = ["pending", "pending_payment", "confirmed"];

export type AppointmentLoyalty =
  /** Reward already recorded on this booking. */
  | { kind: "applied"; amountCents: number }
  /** Upcoming 4th facial: $50 off is due, judged on completions as of now. */
  | { kind: "due"; amountCents: number; count: number }
  /** Upcoming qualifying booking, reward not due: completed facials counted so far. */
  | { kind: "progress"; count: number; completeBy: string | null }
  /** Completed facial that counts towards the current window (position 1–3+). */
  | { kind: "counted"; position: number };

/**
 * Loyalty state of each qualifying booking for ONE client, evaluated against
 * completions as of `now` (so it catches admin-created and payment-link
 * bookings, and 4ths booked before the 3rd was completed). Bookings that don't
 * qualify (other services, cancelled, package-paid, excluded clients, or
 * completed facials outside the window) are absent from the result.
 *
 * Only the earliest open qualifying booking can be "due" — any later one would
 * be the 5th. Open bookings dated before today are treated as missed and are
 * skipped, unless named as `includeId` (e.g. completing yesterday's booking).
 */
export function computeAppointmentLoyalty(
  appointments: LoyaltyAppointment[],
  opts: { excluded: boolean; now: Date | string; includeId?: string },
): Map<string, AppointmentLoyalty> {
  const result = new Map<string, AppointmentLoyalty>();
  if (opts.excluded) return result;

  // The named booking is judged as not yet completed, so it can't count
  // towards its own reward (e.g. if it was marked completed first).
  if (opts.includeId) {
    appointments = appointments.map((a) =>
      a.id === opts.includeId && a.status === "completed" ? { ...a, status: "confirmed" } : a,
    );
  }

  const today = brisbaneDate(opts.now);
  const qualifying = appointments.filter((a) => isLoyaltyServiceDbId(a.serviceId) && a.status !== "cancelled");

  const counted = computeLoyaltyStatus(appointments, { excluded: false, asOf: opts.now }).countedAppointmentIds;
  for (const a of qualifying) {
    if (a.loyaltyDiscountCents > 0) {
      result.set(a.id, { kind: "applied", amountCents: a.loyaltyDiscountCents });
    } else if (a.status === "completed") {
      const i = counted.indexOf(a.id);
      if (i >= 0) result.set(a.id, { kind: "counted", position: i + 1 });
    }
  }

  const open = qualifying
    .filter(
      (a) =>
        OPEN_STATUSES.includes(a.status) &&
        a.loyaltyDiscountCents === 0 &&
        !a.paidViaPackage &&
        (brisbaneDate(a.startISO) >= today || a.id === opts.includeId),
    )
    .sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime());

  let rewardTaken = false;
  for (const a of open) {
    // Completed facials only, so the booking being judged never counts itself.
    const s = computeLoyaltyStatus(appointments, { excluded: false, asOf: a.startISO });
    if (!rewardTaken && s.rewardDue) {
      result.set(a.id, { kind: "due", amountCents: LOYALTY_REWARD_CENTS, count: s.count });
      rewardTaken = true;
    } else {
      // After a due booking the count restarts from it.
      result.set(a.id, { kind: "progress", count: rewardTaken ? 0 : s.count, completeBy: rewardTaken ? null : s.completeBy });
    }
  }

  return result;
}
