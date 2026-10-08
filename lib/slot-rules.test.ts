// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BLOCKING_APPOINTMENT_STATUSES,
  aestToEpochMs,
  bookingLengthMinutes,
  effectiveAppointmentEndMs,
  fetchBusyWindows,
  hasConflict,
  offeredSlots,
  type ServiceLookup,
  type SlotService,
} from "./slot-rules.ts";

// Durations as in lib/services-data.ts (which can't be loaded under node --test).
const SVC: Record<string, SlotService & { name: string }> = {
  indulge: { name: "Indulge Facial", duration_minutes: 60, padding_minutes: 30, category: "facials" },
  basic: { name: "Basic Facial", duration_minutes: 45, padding_minutes: 30, category: "facials" },
  makeup: { name: "Professional Make-Up Application", duration_minutes: 75, padding_minutes: 45, category: "make-up" },
  liftingCode: { name: "Lifting Code Facial", duration_minutes: 90, padding_minutes: 30, category: "facials" },
  browWax: { name: "Brow Wax", duration_minutes: 30, padding_minutes: 30, category: "brow-treatments" },
};
const lookup: ServiceLookup = (name) => Object.values(SVC).find((s) => s.name === name);

// ── Minimal stand-in for the supabase-js query builder ─────────────────────
type Row = Record<string, unknown>;
function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  const builder = (rows: Row[]) => {
    const preds: ((r: Row) => boolean)[] = [];
    const b = {
      select: () => b,
      in: (col: string, vals: unknown[]) => (preds.push((r) => vals.includes(r[col])), b),
      eq: (col: string, v: unknown) => (preds.push((r) => r[col] === v), b),
      neq: (col: string, v: unknown) => (preds.push((r) => r[col] !== v), b),
      gte: (col: string, v: string) => (preds.push((r) => String(r[col]) >= v), b),
      lt: (col: string, v: string) => (preds.push((r) => String(r[col]) < v), b),
      then: (resolve: (x: { data: Row[] }) => unknown) =>
        Promise.resolve({ data: rows.filter((r) => preds.every((p) => p(r))) }).then(resolve),
    };
    return b;
  };
  return { from: (t: string) => builder(tables[t] ?? []) } as unknown as SupabaseClient;
}

const iso = (date: string, hhmm: string) => new Date(aestToEpochMs(date, hhmm)).toISOString();
const appt = (date: string, start: string, end: string, status: string, svc: { name: string }) => ({
  id: `${date}-${start}-${status}`,
  start_datetime: iso(date, start),
  end_datetime: iso(date, end),
  status,
  services: { name: svc.name },
});

// Thu 8 Oct 2026: two unpaid admin Indulge bookings, 11:30 and 3:00, plus a
// cancelled one in the gap that must not block anything.
const DAY = "2026-10-08";
const OPEN = "10:00";
const CLOSE = "17:30";
const oct8 = fakeSupabase({
  appointments: [
    appt(DAY, "11:30", "13:00", "pending_payment", SVC.indulge),
    appt(DAY, "15:00", "16:30", "pending_payment", SVC.indulge),
    appt(DAY, "13:00", "14:30", "cancelled", SVC.indulge),
  ],
  class_sessions: [],
});

/** The time list exactly as GET /api/availability builds it. */
async function timeList(db: SupabaseClient, svc: SlotService, isNew: boolean, nowMs: number) {
  // Same window as the route: from 24h before the AEST day to its end
  const from = new Date(aestToEpochMs(DAY, "00:00") - 24 * 3600_000).toISOString();
  const busy = await fetchBusyWindows(db, from, iso(DAY, "24:00"), lookup);
  return offeredSlots({ date: DAY, lengthMinutes: bookingLengthMinutes(svc, isNew), openTime: OPEN, closeTime: CLOSE, busy, blocked: [], nowMs });
}

/** The submit-time check exactly as POST /api/bookings runs it. */
function submitClashes(db: SupabaseClient, svc: SlotService, isNew: boolean, hhmm: string) {
  const start = aestToEpochMs(DAY, hhmm);
  const end = start + bookingLengthMinutes(svc, isNew) * 60_000;
  return hasConflict(db, new Date(start).toISOString(), new Date(end).toISOString(), lookup);
}

const EARLY = aestToEpochMs(DAY, "07:00"); // every slot clears 2h notice
const AT_955 = aestToEpochMs(DAY, "09:55"); // when she was booking

test("pending_payment holds its slot", () => {
  assert.ok((BLOCKING_APPOINTMENT_STATUSES as readonly string[]).includes("pending_payment"));
  assert.ok(!(BLOCKING_APPOINTMENT_STATUSES as readonly string[]).includes("cancelled"));
});

test("new-client length: +15, except Mother & Daughter", () => {
  assert.equal(bookingLengthMinutes(SVC.indulge, false), 90);
  assert.equal(bookingLengthMinutes(SVC.indulge, true), 105);
  const md = { duration_minutes: 120, padding_minutes: 30, category: "mother-daughter" };
  assert.equal(bookingLengthMinutes(md, true), 150);
});

test("8 Oct: Indulge time list matches what the submit check accepts", async () => {
  assert.deepEqual(await timeList(oct8, SVC.indulge, false, EARLY), ["10:00", "13:00", "13:30"]);
  assert.deepEqual(await timeList(oct8, SVC.indulge, true, EARLY), ["13:00"]);
  // What she should have been shown at 9:55 (she was shown 12:00–4:00)
  assert.deepEqual(await timeList(oct8, SVC.indulge, false, AT_955), ["13:00", "13:30"]);
  assert.deepEqual(await timeList(oct8, SVC.indulge, true, AT_955), ["13:00"]);
  // Her rejected attempts are still rejected; the one that went through still does
  assert.equal(await submitClashes(oct8, SVC.indulge, true, "13:30"), true);
  assert.equal(await submitClashes(oct8, SVC.indulge, true, "14:00"), true);
  assert.equal(await submitClashes(oct8, SVC.indulge, false, "14:00"), true);
  assert.equal(await submitClashes(oct8, SVC.indulge, false, "13:00"), false);
});

test("8 Oct: other durations", async () => {
  // 75+45 = 120 min fills the 1–3pm gap exactly; +15 for a new client doesn't fit
  assert.deepEqual(await timeList(oct8, SVC.makeup, false, EARLY), ["13:00"]);
  assert.deepEqual(await timeList(oct8, SVC.makeup, true, EARLY), []);
  // 45+30 = 75 min
  assert.deepEqual(await timeList(oct8, SVC.basic, false, EARLY), ["10:00", "13:00", "13:30"]);
  assert.deepEqual(await timeList(oct8, SVC.basic, true, EARLY), ["10:00", "13:00", "13:30"]);
  // 30+30 = 60 min; afternoon after the 3pm booking opens up
  assert.deepEqual(await timeList(oct8, SVC.browWax, false, EARLY), ["10:00", "10:30", "13:00", "13:30", "14:00", "16:30"]);
  // 4:30pm is gone for a new client: 75 min would run past the 5:30 close
  assert.deepEqual(await timeList(oct8, SVC.browWax, true, EARLY), ["10:00", "13:00", "13:30"]);
});

test("time list and submit check agree on every slot, every service, new and returning", async () => {
  for (const svc of Object.values(SVC)) {
    for (const isNew of [false, true]) {
      for (const now of [EARLY, AT_955]) {
        const offered = new Set(await timeList(oct8, svc, isNew, now));
        const len = bookingLengthMinutes(svc, isNew);
        for (let m = 10 * 60; m + len <= 17 * 60 + 30; m += 30) {
          const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          if (aestToEpochMs(DAY, hhmm) - now < 2 * 3600_000) {
            assert.ok(!offered.has(hhmm), `${svc.name} ${hhmm} offered inside 2h notice`);
            continue;
          }
          const clash = await submitClashes(oct8, svc, isNew, hhmm);
          assert.equal(offered.has(hhmm), !clash, `${svc.name} new=${isNew} ${hhmm}: offered=${offered.has(hhmm)} clash=${clash}`);
        }
      }
    }
  }
});

test("a booking from before a duration increase blocks its CURRENT length", () => {
  // Stored as 60 min under an old config; Indulge is now 60+30
  const end = effectiveAppointmentEndMs(iso(DAY, "11:30"), iso(DAY, "12:30"), "Indulge Facial", lookup);
  assert.equal(end, aestToEpochMs(DAY, "13:00"));
  // A longer stored end (new-client +15) is kept
  const longer = effectiveAppointmentEndMs(iso(DAY, "11:30"), iso(DAY, "13:15"), "Indulge Facial", lookup);
  assert.equal(longer, aestToEpochMs(DAY, "13:15"));
});

test("group class sessions block duration + 30 min on both sides", async () => {
  const db = fakeSupabase({
    appointments: [],
    class_sessions: [
      { id: "c1", start_datetime: iso(DAY, "12:00"), duration_minutes: 120, active: true },
      { id: "c2", start_datetime: iso(DAY, "16:00"), duration_minutes: 60, active: false },
    ],
  });
  // Class holds 12:00–14:30; the inactive one at 4pm holds nothing
  assert.deepEqual(await timeList(db, SVC.indulge, false, EARLY), ["10:00", "10:30", "14:30", "15:00", "15:30", "16:00"]);
  assert.equal(await submitClashes(db, SVC.indulge, false, "14:00"), true);
  assert.equal(await submitClashes(db, SVC.indulge, false, "14:30"), false);
});
