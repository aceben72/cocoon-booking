/**
 * Takings report — totals by payment method per day, by Australian financial
 * year quarter (Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun).
 * Pure logic only (no imports) so it can be unit-tested with `node --test`.
 */

export interface Quarter {
  /** Financial year by its ending calendar year: FY2027 = 1 Jul 2026 – 30 Jun 2027. */
  fy: number;
  q: 1 | 2 | 3 | 4;
}

/** "2027-Q2" ⇄ { fy: 2027, q: 2 } */
export function quarterKey(x: Quarter): string {
  return `${x.fy}-Q${x.q}`;
}

export function parseQuarterKey(key: string | null | undefined): Quarter | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key ?? "");
  return m ? { fy: Number(m[1]), q: Number(m[2]) as Quarter["q"] } : null;
}

export function quarterLabel(x: Quarter): string {
  const months = { 1: "Jul–Sep", 2: "Oct–Dec", 3: "Jan–Mar", 4: "Apr–Jun" }[x.q];
  const year = x.q <= 2 ? x.fy - 1 : x.fy;
  return `Q${x.q} FY${String(x.fy - 1).slice(2)}/${String(x.fy).slice(2)} (${months} ${year})`;
}

/** Quarter containing a Brisbane date (YYYY-MM-DD). */
export function quarterOf(date: string): Quarter {
  const [y, m] = date.split("-").map(Number);
  if (m >= 7) return { fy: y + 1, q: m <= 9 ? 1 : 2 };
  return { fy: y, q: m <= 3 ? 3 : 4 };
}

/** First and last Brisbane dates (inclusive) of a quarter. */
export function quarterDates(x: Quarter): { from: string; to: string } {
  const startMonth = { 1: 7, 2: 10, 3: 1, 4: 4 }[x.q];
  const year = x.q <= 2 ? x.fy - 1 : x.fy;
  const lastDay = new Date(Date.UTC(year, startMonth + 2, 0)).getUTCDate();
  const mm = (n: number) => String(n).padStart(2, "0");
  return { from: `${year}-${mm(startMonth)}-01`, to: `${year}-${mm(startMonth + 2)}-${mm(lastDay)}` };
}

/** UTC instants bounding a quarter in Brisbane time (UTC+10, no DST): [start, end). */
export function quarterBoundsUTC(x: Quarter): { startISO: string; endISO: string } {
  const { from, to } = quarterDates(x);
  const start = new Date(`${from}T00:00:00+10:00`);
  const end = new Date(new Date(`${to}T00:00:00+10:00`).getTime() + 24 * 60 * 60 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/** Quarters from `first` to `last` inclusive, newest first. */
export function quartersBetween(first: Quarter, last: Quarter): Quarter[] {
  const out: Quarter[] = [];
  let cur = { ...last };
  while (cur.fy > first.fy || (cur.fy === first.fy && cur.q >= first.q)) {
    out.push({ ...cur });
    cur = cur.q === 1 ? { fy: cur.fy - 1, q: 4 } : { fy: cur.fy, q: (cur.q - 1) as Quarter["q"] };
  }
  return out;
}

export interface TakingsEntry {
  paidISO: string;
  amountCents: number;
  /** appointment_payments.method, or "class_card" for group class bookings (Square). */
  method: string;
}

export interface TakingsRow {
  date: string; // Brisbane YYYY-MM-DD
  cardCents: number;      // appointments paid by card (Square online, payment link, studio terminal)
  classCardCents: number; // group class bookings (always Square online)
  cashCents: number;
  payidCents: number;
  unknownCents: number;   // backfilled, method not yet confirmed
  totalCents: number;     // takings = card + class card + cash + PayID + unknown
  gstCents: number;       // total / 11
  giftCardRedeemedCents: number;     // NOT takings — income when the card was sold
  packageRedeemedCents: number;      // NOT takings — income when the package was sold
}

function brisbaneDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 10 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function emptyRow(date: string): TakingsRow {
  return {
    date, cardCents: 0, classCardCents: 0, cashCents: 0, payidCents: 0, unknownCents: 0,
    totalCents: 0, gstCents: 0, giftCardRedeemedCents: 0, packageRedeemedCents: 0,
  };
}

function finish(r: TakingsRow): TakingsRow {
  r.totalCents = r.cardCents + r.classCardCents + r.cashCents + r.payidCents + r.unknownCents;
  r.gstCents = Math.round(r.totalCents / 11);
  return r;
}

/** Per-day rows (oldest first) plus a totals row. */
export function aggregateTakings(entries: TakingsEntry[]): { days: TakingsRow[]; totals: TakingsRow } {
  const byDay = new Map<string, TakingsRow>();
  for (const e of entries) {
    const date = brisbaneDate(e.paidISO);
    const r = byDay.get(date) ?? byDay.set(date, emptyRow(date)).get(date)!;
    switch (e.method) {
      case "card_square": r.cardCents += e.amountCents; break;
      case "class_card": r.classCardCents += e.amountCents; break;
      case "cash": r.cashCents += e.amountCents; break;
      case "payid_bank": r.payidCents += e.amountCents; break;
      case "gift_card": r.giftCardRedeemedCents += e.amountCents; break;
      case "facial_package": r.packageRedeemedCents += e.amountCents; break;
      default: r.unknownCents += e.amountCents;
    }
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(finish);

  const totals = emptyRow("Total");
  for (const d of days) {
    totals.cardCents += d.cardCents;
    totals.classCardCents += d.classCardCents;
    totals.cashCents += d.cashCents;
    totals.payidCents += d.payidCents;
    totals.unknownCents += d.unknownCents;
    totals.giftCardRedeemedCents += d.giftCardRedeemedCents;
    totals.packageRedeemedCents += d.packageRedeemedCents;
  }
  finish(totals);
  // GST on the quarter total, not the sum of rounded daily figures
  return { days, totals };
}

const CSV_COLUMNS: [keyof TakingsRow, string][] = [
  ["date", "Date"],
  ["cardCents", "Card (bookings)"],
  ["classCardCents", "Card (group classes)"],
  ["cashCents", "Cash"],
  ["payidCents", "PayID / bank"],
  ["unknownCents", "Method not recorded"],
  ["totalCents", "Total takings"],
  ["gstCents", "GST (total / 11)"],
  ["giftCardRedeemedCents", "Gift cards redeemed (not takings)"],
  ["packageRedeemedCents", "Facial packages redeemed (not takings)"],
];

export function takingsCsv(report: { days: TakingsRow[]; totals: TakingsRow }): string {
  const cell = (r: TakingsRow, k: keyof TakingsRow) =>
    k === "date" ? String(r.date) : ((r[k] as number) / 100).toFixed(2);
  const lines = [CSV_COLUMNS.map(([, h]) => h).join(",")];
  for (const r of [...report.days, report.totals]) {
    lines.push(CSV_COLUMNS.map(([k]) => cell(r, k)).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
