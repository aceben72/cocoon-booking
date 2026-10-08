import { type AvailabilityRule } from "@/types";

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

/**
 * Opening hours for an AEST date ("YYYY-MM-DD"), or null if closed that day.
 * Slot generation itself lives in lib/slot-rules.ts (offeredSlots).
 */
export function openingHoursFor(
  dateStr: string,
  availabilityRules: AvailabilityRule[] = DEFAULT_AVAILABILITY,
): { openTime: string; closeTime: string } | null {
  const date = new Date(dateStr + "T00:00:00");
  const dow = date.getDay(); // JS getDay: 0=Sun
  const rule = availabilityRules.find((r) => r.day_of_week === dow);
  if (!rule || rule.is_closed) return null;
  return { openTime: rule.open_time, closeTime: rule.close_time };
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
