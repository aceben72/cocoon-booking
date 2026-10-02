// Run: node --test lib/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLoyaltyStatus,
  computeAppointmentLoyalty,
  addMonths,
  brisbaneDate,
  type LoyaltyAppointment,
} from "./loyalty-rules.ts";

const INDULGE = "82488878-f180-4de6-a257-3ab6c8e83893";
const OPULENCE = "0e83c613-14e1-4b7e-886f-e7c4553f161c";
const LIFTING = "687ac4ad-5ed7-494c-836c-20d48439f2f7";
const BASIC_FACIAL = "729e9c21-5596-4dcf-93f3-582d1607a17f";
const BROW_WAX = "ce9718bc-046b-4cd0-b43e-21a0e0740501";

let n = 0;
/** Appointment at 10am Brisbane (00:00 UTC) on the given date. */
function appt(date: string, serviceId: string, extra: Partial<LoyaltyAppointment> = {}): LoyaltyAppointment {
  return {
    id: `a${++n}`,
    serviceId,
    startISO: `${date}T00:00:00.000Z`,
    status: "completed",
    loyaltyDiscountCents: 0,
    paidViaPackage: false,
    ...extra,
  };
}
const status = (appts: LoyaltyAppointment[], asOf: string, excluded = false) =>
  computeLoyaltyStatus(appts, { excluded, asOf: `${asOf}T00:00:00.000Z` });

test("date helpers", () => {
  assert.equal(addMonths("2026-04-02", 6), "2026-10-02");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28"); // clamps to month end
  assert.equal(addMonths("2027-08-31", 6), "2028-02-29"); // leap year
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15"); // crosses year
  // 11pm UTC is 9am the next day in Brisbane
  assert.equal(brisbaneDate("2026-10-01T23:00:00.000Z"), "2026-10-02");
});

test("no history → nothing counted", () => {
  const s = status([], "2026-10-10");
  assert.deepEqual(
    [s.count, s.windowStart, s.rewardDue, s.completeBy],
    [0, null, false, null],
  );
});

test("mixed services: only Indulge, Opulence, Lifting Code count", () => {
  const s = status([
    appt("2026-05-01", INDULGE),
    appt("2026-06-01", BASIC_FACIAL),
    appt("2026-07-01", BROW_WAX),
    appt("2026-08-01", OPULENCE),
    appt("2026-09-01", LIFTING),
  ], "2026-10-10");
  assert.equal(s.count, 3);
  assert.equal(s.rewardDue, true);
  assert.equal(s.windowStart, "2026-05-01");
});

test("2 counted → not due yet; completeBy is window start + 6 months", () => {
  const s = status([appt("2026-05-10", INDULGE), appt("2026-07-01", OPULENCE)], "2026-10-10");
  assert.equal(s.count, 2);
  assert.equal(s.rewardDue, false);
  assert.equal(s.windowStart, "2026-05-10");
  assert.equal(s.completeBy, "2026-11-10");
});

test("a cancelled facial in the middle doesn't count", () => {
  const s = status([
    appt("2026-05-01", INDULGE),
    appt("2026-06-01", INDULGE, { status: "cancelled" }),
    appt("2026-07-01", INDULGE),
  ], "2026-10-10");
  assert.equal(s.count, 2);
  assert.equal(s.rewardDue, false);
});

test("confirmed (not yet completed) facials don't count", () => {
  const s = status([
    appt("2026-05-01", INDULGE),
    appt("2026-06-01", INDULGE),
    appt("2026-07-01", INDULGE, { status: "confirmed" }),
    appt("2026-08-01", INDULGE, { status: "pending_payment" }),
  ], "2026-10-10");
  assert.equal(s.count, 2);
});

test("a facial package redemption doesn't count", () => {
  const s = status([
    appt("2026-05-01", INDULGE),
    appt("2026-06-01", INDULGE, { paidViaPackage: true }),
    appt("2026-07-01", OPULENCE),
  ], "2026-10-10");
  assert.equal(s.count, 2);
  assert.equal(s.rewardDue, false);
});

test("facials older than 6 months drop off and the window slides", () => {
  const appts = [
    appt("2026-01-15", INDULGE),
    appt("2026-04-01", INDULGE),
    appt("2026-06-01", INDULGE),
  ];
  // 4th on 15 Jul: Jan 15 + 6 months = Jul 15 → still in window (inclusive)
  const onTheDay = status(appts, "2026-07-15");
  assert.equal(onTheDay.count, 3);
  assert.equal(onTheDay.rewardDue, true);
  assert.equal(onTheDay.completeBy, "2026-07-15");
  // 4th on 16 Jul: Jan 15 has dropped off, window now starts 1 Apr
  const dayAfter = status(appts, "2026-07-16");
  assert.equal(dayAfter.count, 2);
  assert.equal(dayAfter.rewardDue, false);
  assert.equal(dayAfter.windowStart, "2026-04-01");
  assert.equal(dayAfter.completeBy, "2026-10-01");
});

test("4+ counted (e.g. history at launch): due until fewer than 3 remain", () => {
  const appts = [
    appt("2026-04-05", INDULGE),
    appt("2026-05-05", INDULGE),
    appt("2026-06-05", INDULGE),
    appt("2026-08-05", INDULGE),
  ];
  const s = status(appts, "2026-10-02");
  assert.equal(s.count, 4);
  assert.equal(s.rewardDue, true);
  assert.equal(s.windowStart, "2026-04-05");
  // lapses 6 months after the 3rd most recent (5 May)
  assert.equal(s.completeBy, "2026-11-05");
  assert.equal(status(appts, "2026-11-06").rewardDue, false);
});

test("count resets after the reward is used", () => {
  const s = status([
    appt("2026-04-01", INDULGE),
    appt("2026-05-01", INDULGE),
    appt("2026-06-01", INDULGE),
    appt("2026-07-01", INDULGE, { loyaltyDiscountCents: 5000 }), // the reward
    appt("2026-08-01", OPULENCE),
  ], "2026-10-10");
  assert.equal(s.count, 1);
  assert.equal(s.rewardDue, false);
  assert.equal(s.windowStart, "2026-08-01");
  assert.equal(s.lastRewardISO, "2026-07-01T00:00:00.000Z");
});

test("an upcoming reward booking blocks a second reward", () => {
  // Jacqui's case: 3 completed, reward already booked for 24 Oct
  const appts = [
    appt("2026-06-01", INDULGE),
    appt("2026-07-15", INDULGE),
    appt("2026-09-12", INDULGE),
    appt("2026-10-24", INDULGE, { status: "confirmed", loyaltyDiscountCents: 5000 }),
  ];
  assert.equal(status(appts, "2026-10-20").rewardDue, false);
  assert.equal(status(appts, "2026-11-30").rewardDue, false);
  assert.equal(status(appts, "2026-10-20").count, 0);
});

test("cancelling the reward appointment gives the reward back", () => {
  const s = status([
    appt("2026-06-01", INDULGE),
    appt("2026-07-15", INDULGE),
    appt("2026-09-12", INDULGE),
    appt("2026-10-24", INDULGE, { status: "cancelled", loyaltyDiscountCents: 5000 }),
  ], "2026-11-01");
  assert.equal(s.count, 3);
  assert.equal(s.rewardDue, true);
  assert.equal(s.lastRewardISO, null);
});

test("excluded clients: no count, no reward", () => {
  const s = status([
    appt("2026-06-01", INDULGE),
    appt("2026-07-01", INDULGE),
    appt("2026-08-01", INDULGE),
  ], "2026-10-10", true);
  assert.equal(s.excluded, true);
  assert.equal(s.count, 0);
  assert.equal(s.rewardDue, false);
});

test("counted ids are returned oldest first", () => {
  const a = appt("2026-08-01", INDULGE);
  const b = appt("2026-06-01", OPULENCE);
  assert.deepEqual(status([a, b], "2026-10-10").countedAppointmentIds, [b.id, a.id]);
});

// ── Per-booking loyalty (admin views + Complete panel), judged as of now ─────

const NOW = "2026-10-02T00:00:00.000Z";
const perAppt = (appts: LoyaltyAppointment[], opts: { excluded?: boolean; includeId?: string } = {}) =>
  computeAppointmentLoyalty(appts, { excluded: opts.excluded ?? false, now: NOW, includeId: opts.includeId });

test("upcoming 4th booking (e.g. admin-created) is flagged due", () => {
  const upcoming = appt("2026-10-20", INDULGE, { status: "pending_payment" });
  const done = [appt("2026-06-01", INDULGE), appt("2026-07-01", OPULENCE), appt("2026-08-01", LIFTING)];
  const m = perAppt([...done, upcoming]);
  assert.deepEqual(m.get(upcoming.id), { kind: "due", amountCents: 5000, count: 3 });
  assert.deepEqual(done.map((a) => m.get(a.id)), [
    { kind: "counted", position: 1 },
    { kind: "counted", position: 2 },
    { kind: "counted", position: 3 },
  ]);
});

test("4th booked online before the 3rd was completed: due once the 3rd completes", () => {
  const third = appt("2026-09-25", INDULGE, { status: "confirmed" });
  const fourth = appt("2026-10-20", INDULGE, { status: "confirmed" });
  const appts = [appt("2026-06-01", INDULGE), appt("2026-07-01", INDULGE), third, fourth];
  // 3rd not marked completed yet → not due, progress 2
  assert.deepEqual(perAppt(appts).get(fourth.id), { kind: "progress", count: 2, completeBy: "2026-12-01" });
  // once it's completed → due
  third.status = "completed";
  assert.equal(perAppt(appts).get(fourth.id)?.kind, "due");
});

test("only the earliest upcoming booking is due; later ones restart at 0", () => {
  const a = appt("2026-10-20", INDULGE, { status: "confirmed" });
  const b = appt("2026-11-20", OPULENCE, { status: "confirmed" });
  const m = perAppt([appt("2026-06-01", INDULGE), appt("2026-07-01", INDULGE), appt("2026-08-01", INDULGE), b, a]);
  assert.equal(m.get(a.id)?.kind, "due");
  assert.deepEqual(m.get(b.id), { kind: "progress", count: 0, completeBy: null });
});

test("a package-paid upcoming booking is skipped; the next one gets the reward", () => {
  const pkg = appt("2026-10-10", INDULGE, { status: "confirmed", paidViaPackage: true });
  const next = appt("2026-10-20", INDULGE, { status: "confirmed" });
  const m = perAppt([appt("2026-06-01", INDULGE), appt("2026-07-01", INDULGE), appt("2026-08-01", INDULGE), pkg, next]);
  assert.equal(m.has(pkg.id), false);
  assert.equal(m.get(next.id)?.kind, "due");
});

test("a stale past booking never marked completed doesn't take the flag", () => {
  const stale = appt("2026-09-28", INDULGE, { status: "confirmed" });
  const next = appt("2026-10-20", INDULGE, { status: "confirmed" });
  const m = perAppt([appt("2026-06-01", INDULGE), appt("2026-07-01", INDULGE), appt("2026-08-01", INDULGE), stale, next]);
  assert.equal(m.has(stale.id), false);
  assert.equal(m.get(next.id)?.kind, "due");
});

test("reward already recorded shows as applied, and blocks another", () => {
  const reward = appt("2026-10-24", INDULGE, { status: "confirmed", loyaltyDiscountCents: 5000 });
  const later = appt("2026-11-10", INDULGE, { status: "confirmed" });
  const m = perAppt([appt("2026-06-01", INDULGE), appt("2026-07-15", INDULGE), appt("2026-09-12", INDULGE), reward, later]);
  assert.deepEqual(m.get(reward.id), { kind: "applied", amountCents: 5000 });
  assert.equal(m.get(later.id)?.kind, "progress");
});

test("Complete panel: due even if the booking was already marked completed or is from yesterday", () => {
  const target = appt("2026-10-01", INDULGE, { status: "completed" }); // yesterday
  const appts = [appt("2026-06-01", INDULGE), appt("2026-07-01", INDULGE), appt("2026-08-01", INDULGE), target];
  assert.equal(perAppt(appts, { includeId: target.id }).get(target.id)?.kind, "due");
  // without includeId it's just a counted completion
  assert.equal(perAppt(appts).get(target.id)?.kind, "counted");
});

test("excluded client: nothing flagged", () => {
  const upcoming = appt("2026-10-20", INDULGE, { status: "confirmed" });
  const m = perAppt([appt("2026-06-01", INDULGE), appt("2026-07-01", INDULGE), appt("2026-08-01", INDULGE), upcoming], { excluded: true });
  assert.equal(m.size, 0);
});

test("other services and cancelled bookings get no loyalty state", () => {
  const brow = appt("2026-10-20", BROW_WAX, { status: "confirmed" });
  const cancelled = appt("2026-10-21", INDULGE, { status: "cancelled" });
  const m = perAppt([brow, cancelled]);
  assert.equal(m.size, 0);
});
