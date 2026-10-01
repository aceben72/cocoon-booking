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
 * Saving for paying by cash, PayID or bank transfer instead of card, in whole
 * dollars. Returns 0 when there's no cash price or it isn't lower.
 */
export function cashSavingDollars(priceCents: number, cashPriceCents: number | null | undefined): number {
  if (cashPriceCents == null || cashPriceCents >= priceCents) return 0;
  return Math.round((priceCents - cashPriceCents) / 100);
}

/** "Save $X when you pay by cash, PayID or bank transfer", or null if no saving. */
export function cashSavingText(priceCents: number, cashPriceCents: number | null | undefined): string | null {
  const dollars = cashSavingDollars(priceCents, cashPriceCents);
  return dollars > 0 ? `Save $${dollars} when you pay by cash, PayID or bank transfer` : null;
}

/**
 * Whether a service can be booked online with a deposit (balance paid on the
 * day). Services without this are fully prepaid by card at booking. Single
 * source of truth for the booking flow (StepPayment) and POST /api/bookings.
 */
const FULLY_PREPAID_CATEGORIES: Service["category"][] = ["brow-treatments", "led-light-treatments", "mother-daughter"];
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

/** Cash saving in cents for a service (0 for fully prepaid services or no saving). */
export function serviceCashSavingCents(service: Pick<Service, "category" | "price_cents" | "cash_price_cents">): number {
  return hasDepositOption(service) ? cashSavingDollars(service.price_cents, service.cash_price_cents) * 100 : 0;
}

export const CASH_SAVING_NOTE =
  "Pay by cash, PayID or bank transfer on the day and save the card fee — the discount is taken off at checkout.";

/** Format duration in minutes to human string, e.g. 90 → "1 hr 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Normalise an Australian mobile to +61 format. Returns null if invalid. */
export function normaliseMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("61") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+61${digits.slice(1)}`;
  return null;
}

/** Validate Australian mobile number format */
export function isValidAustralianMobile(mobile: string): boolean {
  return normaliseMobile(mobile) !== null;
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
