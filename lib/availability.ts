import { type AvailabilityRule, type BlockedPeriod } from "@/types";

// Amanda's weekly schedule (day_of_week: 0=Sun…6=Sat)
export const DEFAULT_AVAILABILITY: AvailabilityRule[] = [
  { id: "sun", day_of_week: 0, open_time: "10:00", close_time: "16:00", is_closed: false },
  { id: "mon", day_of_week: 1, open_time: "10:00", close_time: "17:30", is_closed: true },
  { id: "tue", day_of_week: 2, open_time: "10:00", close_time: "17:30", is_closed: true },
  { id: "wed", day_of_week: 3, open_time: "10:00", close_time: "17:30", is_closed: true },
  { id: "thu", day_of_week: 4, open_time: "10:00", close_time: "17:30", is_closed: false },
  { id: "fri", day_of_week: 5, open_time: "10:00", close_time: "17:30", is_closed: false },
  { id: "sat", day_of_week: 6, open_time: "10:00", close_time: "16:30", is_closed: false },
];

/** Convert "HH:MM" to total minutes from midnight */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Convert minutes from midnight to "HH:MM" */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Get available time slots for a given date string (AEST "YYYY-MM-DD"),
 * service duration (minutes), padding (minutes), and existing appointments.
 *
 * Existing appointments are [{start: "HH:MM", end: "HH:MM"}] in AEST.
 * Blocked periods are similarly expressed as AEST ranges.
 */
export function getAvailableSlots(
  dateStr: string,
  durationMins: number,
  paddingMins: number,
  existingBookings: { start: string; end: string }[],
  blockedPeriods: { start: string; end: string }[],
  availabilityRules: AvailabilityRule[] = DEFAULT_AVAILABILITY,
): string[] {
  const date = new Date(dateStr + "T00:00:00");
  const dow = date.getDay(); // JS getDay: 0=Sun

  const rule = availabilityRules.find((r) => r.day_of_week === dow);
  if (!rule || rule.is_closed) return [];

  const openMins = timeToMinutes(rule.open_time);
  const closeMins = timeToMinutes(rule.close_time);
  const totalSlotMins = durationMins + paddingMins;

  const slots: string[] = [];

  // Generate 30-minute increment slots
  for (let start = openMins; start + totalSlotMins <= closeMins; start += 30) {
    const slotEnd = start + totalSlotMins;
    const startStr = minutesToTime(start);
    const endStr = minutesToTime(slotEnd);

    const overlaps = (a: string, b: string, c: string, d: string) =>
      timeToMinutes(a) < timeToMinutes(d) && timeToMinutes(c) < timeToMinutes(b);

    const blocked =
      existingBookings.some((b) => overlaps(startStr, endStr, b.start, b.end)) ||
      blockedPeriods.some((b) => overlaps(startStr, endStr, b.start, b.end));

    if (!blocked) slots.push(startStr);
  }

  return slots;
}

/**
 * Check if a given date (YYYY-MM-DD AEST) is a valid bookable date:
 * - Not in the past (today is always selectable; 2-hour slot filtering is
 *   handled at the API level, not here)
 * - Within the next 60 days
 * - Not on a closed day
 */
export function isBookableDate(
  dateStr: string,
  availabilityRules: AvailabilityRule[] = DEFAULT_AVAILABILITY,
): boolean {
  const now = new Date();

  // Midnight UTC on the given date = start of that AEST day
  const [y, mo, d] = dateStr.split("-").map(Number);
  const startOfDayUTC = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));

  // Must be within 60 days from now
  const maxDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  if (startOfDayUTC > maxDate) return false;

  // Must not be a closed day
  const date = new Date(dateStr + "T00:00:00");
  const dow = date.getDay();
  const rule = availabilityRules.find((r) => r.day_of_week === dow);
  return !!(rule && !rule.is_closed);
}
