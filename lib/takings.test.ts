// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateTakings,
  parseQuarterKey,
  quarterBoundsUTC,
  quarterDates,
  quarterLabel,
  quarterOf,
  quartersBetween,
  takingsCsv,
} from "./takings.ts";

test("Australian FY quarters", () => {
  assert.deepEqual(quarterOf("2026-07-01"), { fy: 2027, q: 1 });
  assert.deepEqual(quarterOf("2026-09-30"), { fy: 2027, q: 1 });
  assert.deepEqual(quarterOf("2026-10-02"), { fy: 2027, q: 2 });
  assert.deepEqual(quarterOf("2027-01-15"), { fy: 2027, q: 3 });
  assert.deepEqual(quarterOf("2027-06-30"), { fy: 2027, q: 4 });
  assert.deepEqual(quarterDates({ fy: 2027, q: 2 }), { from: "2026-10-01", to: "2026-12-31" });
  assert.deepEqual(quarterDates({ fy: 2027, q: 3 }), { from: "2027-01-01", to: "2027-03-31" });
  assert.deepEqual(quarterDates({ fy: 2026, q: 4 }), { from: "2026-04-01", to: "2026-06-30" });
  assert.equal(quarterLabel({ fy: 2027, q: 2 }), "Q2 FY26/27 (Oct–Dec 2026)");
  assert.deepEqual(parseQuarterKey("2027-Q2"), { fy: 2027, q: 2 });
  assert.equal(parseQuarterKey("nonsense"), null);
});

test("quarter bounds are Brisbane midnight", () => {
  assert.deepEqual(quarterBoundsUTC({ fy: 2027, q: 2 }), {
    startISO: "2026-09-30T14:00:00.000Z",
    endISO: "2026-12-31T14:00:00.000Z",
  });
});

test("quartersBetween lists newest first across a year boundary", () => {
  assert.deepEqual(
    quartersBetween({ fy: 2026, q: 4 }, { fy: 2027, q: 2 }),
    [{ fy: 2027, q: 2 }, { fy: 2027, q: 1 }, { fy: 2026, q: 4 }],
  );
});

test("totals by method per Brisbane day; gift cards and packages excluded from takings; GST = total/11", () => {
  const r = aggregateTakings([
    { paidISO: "2026-10-02T01:00:00Z", amountCents: 14900, method: "cash" },
    { paidISO: "2026-10-02T03:00:00Z", amountCents: 4900, method: "payid_bank" },
    { paidISO: "2026-10-02T05:00:00Z", amountCents: 10400, method: "card_square" },
    { paidISO: "2026-10-02T06:00:00Z", amountCents: 15000, method: "gift_card" },
    { paidISO: "2026-10-01T15:00:00Z", amountCents: 9500, method: "class_card" }, // 1am 2 Oct Brisbane
    { paidISO: "2026-10-03T00:00:00Z", amountCents: 19900, method: "facial_package" },
    { paidISO: "2026-10-03T00:00:00Z", amountCents: 1100, method: "unknown" },
  ]);
  assert.equal(r.days.length, 2);
  const d2 = r.days[0];
  assert.equal(d2.date, "2026-10-02");
  assert.equal(d2.cashCents, 14900);
  assert.equal(d2.payidCents, 4900);
  assert.equal(d2.cardCents, 10400);
  assert.equal(d2.classCardCents, 9500);
  assert.equal(d2.giftCardRedeemedCents, 15000);
  assert.equal(d2.totalCents, 14900 + 4900 + 10400 + 9500); // no gift card
  assert.equal(d2.gstCents, Math.round(d2.totalCents / 11));
  assert.equal(r.days[1].packageRedeemedCents, 19900);
  assert.equal(r.days[1].totalCents, 1100);
  assert.equal(r.totals.totalCents, 39700 + 1100);
  assert.equal(r.totals.gstCents, Math.round(40800 / 11));
});

test("CSV export", () => {
  const csv = takingsCsv(aggregateTakings([{ paidISO: "2026-10-02T01:00:00Z", amountCents: 14900, method: "cash" }]));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0].split(",")[0], "Date");
  assert.equal(lines[1], "2026-10-02,0.00,0.00,149.00,0.00,0.00,149.00,13.55,0.00,0.00");
  assert.equal(lines[2].startsWith("Total,"), true);
});
