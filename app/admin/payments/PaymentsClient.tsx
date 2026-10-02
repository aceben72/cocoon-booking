"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompletePaymentPanel } from "@/components/CompletePaymentPanel";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/complete-payment";

export interface OwingRow {
  id: string;
  startISO: string;
  client: string;
  service: string;
  amountCents: number;
  paidCents: number;
  paidMethods: PaymentMethod[];
  balanceCents: number;
}

export interface UnknownPaymentRow {
  id: string;
  amountCents: number;
  apptStartISO: string;
  client: string;
  service: string;
  notes: string | null;
}

export interface ZeroPriceRow {
  id: string;
  startISO: string;
  client: string;
  service: string;
  servicePriceCents: number;
}

function money(cents: number) {
  const d = cents / 100;
  return d % 1 === 0 ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
}

function date(iso: string) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .format(new Date(iso));
}

const RECLASSIFY: [PaymentMethod, string][] = [
  ["cash", "Cash"],
  ["payid_bank", "PayID / bank"],
  ["card_square", "Card"],
  ["gift_card", "Gift card"],
];

export function PaymentsClient({
  owing,
  unknownPayments,
  zeroPrice,
}: {
  owing: OwingRow[];
  unknownPayments: UnknownPaymentRow[];
  zeroPrice: ZeroPriceRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  async function reclassify(paymentId: string, method: PaymentMethod) {
    setSavingPaymentId(paymentId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error ?? "Failed to save");
        return;
      }
      refresh();
    } finally {
      setSavingPaymentId(null);
    }
  }

  const totalOwing = owing.reduce((s, r) => s + r.balanceCents, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl">Payments</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ── Payment owing ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-2xl">Payment owing</h2>
          <span className="text-sm text-[#7a6f68]">{owing.length} appointment{owing.length !== 1 ? "s" : ""} · {money(totalOwing)}</span>
        </div>
        <p className="text-sm text-[#7a6f68] mb-3">
          Completed appointments with a balance left after all discounts and payments — including ones marked
          &ldquo;Not paid yet&rdquo;. For older appointments, tap <strong>Record payment</strong> and choose how the client
          paid. Nothing here is marked paid automatically.
        </p>
        <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#7a6f68] border-b border-[#e8e0d8]">
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Client</th>
                <th className="px-3 py-3">Service</th>
                <th className="px-3 py-3 text-right">Price</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Balance</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {owing.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[#9a8f87]">Nothing owing.</td></tr>
              )}
              {owing.map((r) => (
                <tr key={r.id} className="border-b border-[#f4efe9]">
                  <td className="px-3 py-2 whitespace-nowrap">{date(r.startISO)}</td>
                  <td className="px-3 py-2">{r.client}</td>
                  <td className="px-3 py-2">{r.service}</td>
                  <td className="px-3 py-2 text-right">{money(r.amountCents)}</td>
                  <td className="px-3 py-2 text-right">
                    {money(r.paidCents)}
                    {r.paidMethods.length > 0 && (
                      <div className="text-[11px] text-[#9a8f87]">{r.paidMethods.map((m) => METHOD_LABEL[m]).join(", ")}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-amber-700">{money(r.balanceCents)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setRecordingId(r.id)}
                      className="text-xs px-2.5 py-1 rounded border border-amber-300 text-amber-800 hover:bg-amber-50 whitespace-nowrap"
                    >
                      Record payment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Payments with no method recorded (backfill) ───────────────── */}
      {unknownPayments.length > 0 && (
        <section>
          <h2 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-2xl mb-2">How were these paid?</h2>
          <p className="text-sm text-[#7a6f68] mb-3">
            These payments were recorded before the app kept track of the method. Tap how each one was paid so it
            lands in the right column of the takings report. The amount doesn&rsquo;t change.
          </p>
          <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {unknownPayments.map((p) => (
                  <tr key={p.id} className="border-b border-[#f4efe9]">
                    <td className="px-3 py-2 whitespace-nowrap">{date(p.apptStartISO)}</td>
                    <td className="px-3 py-2">{p.client}</td>
                    <td className="px-3 py-2">{p.service}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(p.amountCents)}</td>
                    <td className="px-3 py-2 text-xs text-[#9a8f87]">{p.notes}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end flex-wrap">
                        {RECLASSIFY.map(([m, label]) => (
                          <button
                            key={m}
                            disabled={savingPaymentId === p.id}
                            onClick={() => reclassify(p.id, m)}
                            className="text-xs px-2 py-1 rounded border border-[#ddd8d2] text-[#5a504a] hover:border-[#044e77] hover:text-[#044e77] disabled:opacity-50"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── $0 bookings (report only) ─────────────────────────────────── */}
      {zeroPrice.length > 0 && (
        <section>
          <h2 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-2xl mb-2">Completed at $0</h2>
          <p className="text-sm text-[#7a6f68] mb-3">
            Booked with &ldquo;No charge&rdquo; although the service has a price, so they never show as owing. If any of
            these were actually paid, tell Ben — they&rsquo;re listed for review and haven&rsquo;t been changed.
          </p>
          <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {zeroPrice.map((r) => (
                  <tr key={r.id} className="border-b border-[#f4efe9]">
                    <td className="px-3 py-2 whitespace-nowrap">{date(r.startISO)}</td>
                    <td className="px-3 py-2">{r.client}</td>
                    <td className="px-3 py-2">{r.service}</td>
                    <td className="px-3 py-2 text-right text-[#9a8f87]">list price {money(r.servicePriceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {recordingId && (
        <CompletePaymentPanel
          appointmentId={recordingId}
          onClose={() => setRecordingId(null)}
          onDone={() => { setRecordingId(null); refresh(); }}
        />
      )}
    </div>
  );
}
