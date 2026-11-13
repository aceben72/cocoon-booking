import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Service } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format cents to AUD display string, e.g. 2500 → "$25" */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

/**
 * Saving for paying by cash, PayID or direct deposit instead of card, in whole
 * dollars. Returns 0 when there's no cash price or it isn't lower.
 */
export function cashSavingDollars(priceCents: number, cashPriceCents: number | null | undefined): number {
  if (cashPriceCents == null || cashPriceCents >= priceCents) return 0;
  return Math.round((priceCents - cashPriceCents) / 100);
}

/** "Save $X with cash, PayID or direct deposit", or null if no saving. */
export function cashSavingText(priceCents: number, cashPriceCents: number | null | undefined): string | null {
  const dollars = cashSavingDollars(priceCents, cashPriceCents);
  return dollars > 0 ? `Save $${dollars} with cash, PayID or direct deposit` : null;
}

/**
 * Whether a service can be booked online with a deposit (balance paid on the
 * day). Services without this are fully prepaid by card at booking. Single
 * source of truth for the booking flow (StepPayment) and POST /api/bookings.
 */
// Mother & Daughter (its own category) moved to a deposit in Nov 2026 with
// the other private make-up lessons.
const FULLY_PREPAID_CATEGORIES: Service["category"][] = ["brow-treatments", "led-light-treatments"];
export function hasDepositOption(service: Pick<Service, "category">): boolean {
  return !FULLY_PREPAID_CATEGORIES.includes(service.category);
}

/**
 * Client-facing cash saving line for a service, or null. Fully prepaid
 * services never show it — online clients can't pay their balance in cash.
 */
export function serviceCashSavingText(service: Pick<Service, "category" | "price_cents" | "cash_price_cents">): string | null {
  return hasDepositOption(service) ? cashSavingText(service.price_cents, service.cash_price_cents) : null;
}

/**
 * serviceCashSavingText for a whole booking whose totals differ from the
 * service's (Mother & Daughter extras: $10 + $3 per extra daughter). Totals
 * from bookingPriceCents / bookingCashPriceCents in lib/makeup-lessons.ts.
 */
export function bookingCashSavingText(
  service: Pick<Service, "category">,
  totalPriceCents: number,
  totalCashPriceCents: number | null,
): string | null {
  return hasDepositOption(service) ? cashSavingText(totalPriceCents, totalCashPriceCents) : null;
}

/** Cash saving in cents for a whole booking (0 for fully prepaid services). */
export function bookingCashSavingCents(
  service: Pick<Service, "category">,
  totalPriceCents: number,
  totalCashPriceCents: number | null,
): number {
  return hasDepositOption(service) ? cashSavingDollars(totalPriceCents, totalCashPriceCents) * 100 : 0;
}

/** Cash saving in cents for a service (0 for fully prepaid services or no saving). */
export function serviceCashSavingCents(service: Pick<Service, "category" | "price_cents" | "cash_price_cents">): number {
  return hasDepositOption(service) ? cashSavingDollars(service.price_cents, service.cash_price_cents) * 100 : 0;
}

export const CASH_SAVING_NOTE =
  "Paying on the day? Save with cash, PayID or direct deposit — the discount is taken off at checkout.";

/** Format duration in minutes to human string, e.g. 90 → "1 hr 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * The one mobile rule, used on every write and in client matching. Mirrored
 * by public.normalise_mobile() in supabase/migrations/client_dedupe_2026_11.sql
 * (lib/client-dedupe.test.ts checks they agree).
 *   0438 222 499 · 0438222499 · 438222499 · 61438222499 · +61438222499 ·
 *   +61 0438 222 499 · (0438) 222-499   →   +61438222499
 * Anything else (overseas numbers): digits only, keeping a leading +.
 * Blank → null.
 */
export function normaliseMobile(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (/^610\d{9}$/.test(digits)) return `+61${digits.slice(3)}`;
  if (/^61\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{9}$/.test(digits)) return `+61${digits.slice(1)}`;
  if (/^4\d{8}$/.test(digits)) return `+61${digits}`;
  return (trimmed.startsWith("+") ? "+" : "") + digits;
}

/** normaliseMobile, but only an Australian number (+61 and 9 digits). Null otherwise. */
export function normaliseAuMobile(raw: string | null | undefined): string | null {
  const mobile = normaliseMobile(raw);
  return mobile && /^\+61\d{9}$/.test(mobile) ? mobile : null;
}

/** Validate Australian mobile number format */
export function isValidAustralianMobile(mobile: string): boolean {
  return normaliseAuMobile(mobile) !== null;
}

/** normaliseMobile, but only accepts a real mobile (+614…) — landlines can't get SMS. */
export function normaliseSmsMobile(raw: string): string | null {
  const mobile = normaliseMobile(raw);
  return mobile && /^\+614\d{8}$/.test(mobile) ? mobile : null;
}

/** Basic email shape check — same rule the booking form has always used. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Stand-in addresses made for admin bookings with no real email. */
export function isPlaceholderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@cocoonskinandbeauty.com.au");
}

/** Format a "HH:MM" string to 12-hour display, e.g. "14:30" → "2:30pm" */
export function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "pm" : "am";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m.toString().padStart(2, "0")}${period}`;
}

/** Format a Date to AEST "YYYY-MM-DD" string */
export function toAESTDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("/")
    .reverse()
    .join("-");
}

/** Get today's date string in AEST */
export function todayAEST(): string {
  return toAESTDateString(new Date());
}

/** Parse a "YYYY-MM-DD" string into a Date at midnight UTC+10 */
export function parseAESTDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Create as UTC midnight for AEST (UTC+10) = previous day 14:00 UTC
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 10 * 60 * 60 * 1000);
}

/** Convert AEST "YYYY-MM-DD HH:MM" to UTC ISO string */
export function aestToUTC(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  // AEST = UTC+10, so subtract 10 hours
  const utc = new Date(Date.UTC(y, mo - 1, d, h - 10, min, 0));
  return utc.toISOString();
}

/** Format a UTC ISO datetime to AEST display string */
export function formatAESTDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
