/**
 * Private make-up lessons (Nov 2026 restructure): Private Make-Up Lesson,
 * Me & a Friend Make-Up Lesson and Mother & Daughter Make-Up Class. All three
 * are booked like a facial (any free time, $100 deposit). Mother & Daughter
 * takes 0–2 extra daughters at $99 card / $96 cash each, adding no time.
 *
 * Keyed by services.name, so the same rules work for the booking flow
 * (services-data.ts) and for DB rows (admin, Complete panel, Mailchimp).
 * Pure logic only (no imports) so it can be unit-tested with `node --test`.
 */

export const PRIVATE_LESSON_NAME = "Private Make-Up Lesson";
export const FRIEND_LESSON_NAME = "Me & a Friend Make-Up Lesson";
export const MOTHER_DAUGHTER_NAME = "Mother & Daughter Make-Up Class";

export const MAKEUP_LESSON_NAMES: readonly string[] = [PRIVATE_LESSON_NAME, FRIEND_LESSON_NAME, MOTHER_DAUGHTER_NAME];

/** Deposit for the three lessons. Every other service keeps its own deposit. */
export const MAKEUP_LESSON_DEPOSIT_CENTS = 10000;

export const EXTRA_DAUGHTER_PRICE_CENTS = 9900;
export const EXTRA_DAUGHTER_CASH_PRICE_CENTS = 9600;
export const MAX_EXTRA_DAUGHTERS = 2;

export function isMakeupLesson(serviceName: string | null | undefined): boolean {
  return !!serviceName && MAKEUP_LESSON_NAMES.includes(serviceName);
}

export function allowsExtraDaughters(serviceName: string | null | undefined): boolean {
  return serviceName === MOTHER_DAUGHTER_NAME;
}

/** 0–2 for Mother & Daughter, always 0 for anything else (bad input → 0). */
export function normaliseExtraDaughters(serviceName: string | null | undefined, raw: unknown): number {
  if (!allowsExtraDaughters(serviceName)) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, MAX_EXTRA_DAUGHTERS);
}

/** Card price of the whole booking, extras included. This is amount_cents. */
export function bookingPriceCents(service: { name: string; price_cents: number }, extraDaughters: number): number {
  return service.price_cents + normaliseExtraDaughters(service.name, extraDaughters) * EXTRA_DAUGHTER_PRICE_CENTS;
}

/** Cash/PayID price of the whole booking, or null if the service has no cash price. */
export function bookingCashPriceCents(
  service: { name: string; cash_price_cents?: number | null },
  extraDaughters: number,
): number | null {
  if (service.cash_price_cents == null) return null;
  return service.cash_price_cents + normaliseExtraDaughters(service.name, extraDaughters) * EXTRA_DAUGHTER_CASH_PRICE_CENTS;
}

/**
 * Deposit offered on an admin payment link. The lessons take $100; every
 * other service keeps the long-standing $50 payment-link deposit (treatment
 * plans included, which take $527 in the online flow — unchanged here).
 */
export function paymentLinkDepositCents(serviceName: string | null | undefined): number {
  return isMakeupLesson(serviceName) ? MAKEUP_LESSON_DEPOSIT_CENTS : 5000;
}

// ── "What would you like to learn?" (one answer per person) ──────────────

export const EXPERIENCE_LEVELS = ["beginner", "some_experience", "confident"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Beginner",
  some_experience: "Some experience",
  confident: "Confident, want to level up",
};

export const LEARN_QUESTION = "What would you like to learn?";

export type AttendeeRole = "client" | "friend" | "mum" | "daughter" | "extra_daughter";

export interface AttendeeSlot {
  role: AttendeeRole;
  /** 1-based position within the role (extra daughters 1 and 2). */
  position: number;
  label: string;
}

/** The people on a lesson booking, in the order the form asks about them. */
export function lessonAttendeeSlots(serviceName: string | null | undefined, extraDaughters: number): AttendeeSlot[] {
  if (serviceName === PRIVATE_LESSON_NAME) return [{ role: "client", position: 1, label: "You" }];
  if (serviceName === FRIEND_LESSON_NAME) {
    return [
      { role: "client", position: 1, label: "You" },
      { role: "friend", position: 1, label: "Your friend" },
    ];
  }
  if (serviceName === MOTHER_DAUGHTER_NAME) {
    const slots: AttendeeSlot[] = [
      { role: "mum", position: 1, label: "Mum" },
      { role: "daughter", position: 1, label: "Daughter" },
    ];
    const extras = normaliseExtraDaughters(serviceName, extraDaughters);
    for (let i = 1; i <= extras; i++) slots.push({ role: "extra_daughter", position: i, label: `Extra daughter ${i}` });
    return slots;
  }
  return [];
}

export function attendeeLabel(role: string, position: number): string {
  switch (role) {
    case "client": return "Client";
    case "friend": return "Friend";
    case "mum": return "Mum";
    case "daughter": return "Daughter";
    case "extra_daughter": return `Extra daughter ${position}`;
    default: return role;
  }
}

export function isExperienceLevel(v: unknown): v is ExperienceLevel {
  return typeof v === "string" && (EXPERIENCE_LEVELS as readonly string[]).includes(v);
}

/** What the booking form sends for a lesson. Everything is optional. */
export interface LessonDetailsInput {
  extraDaughters?: number;
  /** Keyed `${role}:${position}`, e.g. "extra_daughter:2". */
  levels?: Record<string, string>;
  friend?: { name?: string; email?: string; mobile?: string };
}

export interface AttendeeRow {
  role: AttendeeRole;
  position: number;
  experience_level: ExperienceLevel | null;
  name: string | null;
  email: string | null;
  mobile: string | null;
}

/**
 * appointment_attendees rows for a lesson booking: one per person, answer or
 * not, so the checklist can count heads. Unknown keys and bad values are
 * dropped; friend contact details only for Me & a Friend.
 */
export function lessonAttendeeRows(
  serviceName: string | null | undefined,
  input: LessonDetailsInput | null | undefined,
): AttendeeRow[] {
  const extras = normaliseExtraDaughters(serviceName, input?.extraDaughters);
  const clean = (s: unknown, max = 200) => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null);
  return lessonAttendeeSlots(serviceName, extras).map((slot) => {
    const level = input?.levels?.[`${slot.role}:${slot.position}`];
    const isFriend = slot.role === "friend";
    return {
      role: slot.role,
      position: slot.position,
      experience_level: isExperienceLevel(level) ? level : null,
      name: isFriend ? clean(input?.friend?.name) : null,
      email: isFriend ? clean(input?.friend?.email) : null,
      mobile: isFriend ? clean(input?.friend?.mobile, 40) : null,
    };
  });
}

/** Plain-text lines for Amanda (admin email, calendar): extras, each person's level, friend. */
export function lessonSummaryLines(
  attendees: Pick<AttendeeRow, "role" | "position" | "experience_level" | "name" | "email" | "mobile">[],
  extraDaughters: number,
): string[] {
  const lines: string[] = [];
  if (extraDaughters > 0) lines.push(`Extra daughters: ${extraDaughters}`);
  for (const a of attendees) {
    const level = a.experience_level ? EXPERIENCE_LEVEL_LABELS[a.experience_level] : "not answered";
    lines.push(`${attendeeLabel(a.role, a.position)} — ${level}`);
    if (a.role === "friend") {
      const contact = [a.name, a.email, a.mobile].filter(Boolean).join(", ");
      if (contact) lines.push(`Friend's details: ${contact}`);
    }
  }
  return lines;
}
