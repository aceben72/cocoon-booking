import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  parseQuarterKey,
  quarterKey,
  quarterLabel,
  quarterOf,
  quartersBetween,
  type TakingsRow,
} from "@/lib/takings";
import { firstTakingsISO, loadTakings } from "@/lib/takings-data";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function brisbaneToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());
}

function money(cents: number) {
  return cents === 0 ? "—" : `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

const COLUMNS: [keyof TakingsRow, string][] = [
  ["cardCents", "Card"],
  ["classCardCents", "Classes (card)"],
  ["cashCents", "Cash"],
  ["payidCents", "PayID / bank"],
  ["unknownCents", "Not recorded"],
  ["totalCents", "Total"],
  ["gstCents", "GST (÷11)"],
  ["giftCardRedeemedCents", "Gift card redeemed"],
];

export default async function TakingsPage({ searchParams }: { searchParams: Promise<{ quarter?: string }> }) {
  const params = await searchParams;
  const current = quarterOf(brisbaneToday());
  const quarter = parseQuarterKey(params.quarter) ?? current;

  const db = supabase();
  const [report, firstISO] = await Promise.all([loadTakings(db, quarter), firstTakingsISO(db)]);
  const first = firstISO ? quarterOf(new Date(new Date(firstISO).getTime() + 10 * 3600_000).toISOString().slice(0, 10)) : current;
  const quarters = quartersBetween(first, current);
  const t = report.totals;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl">Takings</h1>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <select
              name="quarter"
              defaultValue={quarterKey(quarter)}
              className="border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm bg-white"
            >
              {quarters.map((q) => (
                <option key={quarterKey(q)} value={quarterKey(q)}>{quarterLabel(q)}</option>
              ))}
            </select>
            <button className="px-3 py-2 rounded-lg border border-[#044e77] text-[#044e77] text-sm">Show</button>
          </form>
          <Link
            href={`/api/admin/takings/export?quarter=${quarterKey(quarter)}`}
            className="px-3 py-2 rounded-lg bg-[#044e77] text-white text-sm"
          >
            Export CSV
          </Link>
        </div>
      </div>

      {/* BAS summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Cash + PayID (for BAS)" value={money(t.cashCents + t.payidCents)} strong />
        <Stat label="Card (Square)" value={money(t.cardCents + t.classCardCents)} />
        <Stat label="Total takings" value={money(t.totalCents)} />
        <Stat label="GST in takings (÷11)" value={money(t.gstCents)} />
      </div>

      {t.unknownCents > 0 && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 mb-4">
          {money(t.unknownCents)} this quarter was paid before payment methods were recorded.{" "}
          <Link href="/admin/payments" className="underline">Confirm the method in Payments</Link> so it lands in the right column.
        </p>
      )}

      <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-[#7a6f68] border-b border-[#e8e0d8]">
              <th className="px-3 py-3">Day</th>
              {COLUMNS.map(([k, h]) => (
                <th key={k} className={`px-3 py-3 text-right whitespace-nowrap ${k === "giftCardRedeemedCents" ? "text-[#b0a499]" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.days.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-[#9a8f87]">No takings recorded this quarter.</td></tr>
            )}
            {report.days.map((d) => (
              <tr key={d.date} className="border-b border-[#f4efe9]">
                <td className="px-3 py-2 whitespace-nowrap">{dayLabel(d.date)}</td>
                {COLUMNS.map(([k]) => (
                  <td key={k} className={`px-3 py-2 text-right ${k === "totalCents" ? "font-medium" : ""} ${k === "giftCardRedeemedCents" ? "text-[#9a8f87]" : ""}`}>
                    {money(d[k] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {report.days.length > 0 && (
            <tfoot>
              <tr className="font-medium bg-[#f8f5f2]">
                <td className="px-3 py-3">Total</td>
                {COLUMNS.map(([k]) => (
                  <td key={k} className="px-3 py-3 text-right">{money(t[k] as number)}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="text-xs text-[#7a6f68] mt-4 space-y-1">
        <p>Takings are counted on the day the money was received. GST = total ÷ 11.</p>
        <p>
          Gift cards redeemed are shown for reference only and are <strong>not</strong> in the total — the gift card
          sale was income when the card was bought.
          {t.packageRedeemedCents > 0 && <> Facial package redemptions ({money(t.packageRedeemedCents)}) are excluded for the same reason.</>}
        </p>
        <p>Gift card and facial package sales themselves are paid through Square and appear in Square&rsquo;s reports, not here.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${strong ? "bg-[#044e77] text-white border-[#044e77]" : "bg-white border-[#e8e0d8]"}`}>
      <div className={`text-xs uppercase tracking-wider ${strong ? "text-white/80" : "text-[#7a6f68]"}`}>{label}</div>
      <div className="text-xl font-medium mt-0.5">{value}</div>
    </div>
  );
}
