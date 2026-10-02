"use client";

import { useEffect, useState } from "react";
import { METHOD_LABEL, type CompleteChoice, type CompletionResult, type PaymentMethod } from "@/lib/complete-payment";

interface Breakdown {
  status: string;
  serviceName: string;
  clientName: string;
  startISO: string;
  amountCents: number;
  couponDiscountCents: number;
  loyaltyDiscountCents: number;
  cashDiscountCents: number;
  amountPaidCents: number;
  loyaltyRewardDueCents: number;
  cashDiscountAvailableCents: number;
  payments: { id: string; amount_cents: number; method: PaymentMethod; paid_at: string; notes: string | null }[];
  options: Record<CompleteChoice, CompletionResult>;
}

function money(cents: number) {
  const d = cents / 100;
  return d % 1 === 0 ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short" }).format(new Date(iso));
}

/**
 * Complete / record payment for one appointment. Shows the price, each
 * discount, what's been paid and the balance, with one-tap buttons. The
 * server recomputes everything; this only displays and sends the choice.
 */
export function CompletePaymentPanel({
  appointmentId,
  onClose,
  onDone,
}: {
  appointmentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [otherChoice, setOtherChoice] = useState<Exclude<CompleteChoice, "not_paid">>("cash");
  const [otherAmount, setOtherAmount] = useState("");

  async function load() {
    setError(null);
    const res = await fetch(`/api/admin/appointments/${appointmentId}/payment`);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Failed to load"); return; }
    setData(d as Breakdown);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [appointmentId]);

  async function submit(choice: CompleteChoice, otherAmountCents?: number) {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice, otherAmountCents, expectedPaidCents: data.amountPaidCents }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Failed to save");
        if (res.status === 409) load();
        return;
      }
      onDone();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  function submitOther() {
    const cents = Math.round(parseFloat(otherAmount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { setError("Enter an amount"); return; }
    submit(otherChoice, cents);
  }

  const card = data?.options.card;
  const cash = data?.options.cash;
  const loyaltyCents = data ? (data.loyaltyDiscountCents || data.loyaltyRewardDueCents) : 0;
  const nothingOwing = !!card && card.balanceBeforeCents === 0;
  const alreadyCompleted = data?.status === "completed";

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-2xl">
              {alreadyCompleted ? "Record payment" : "Complete appointment"}
            </h3>
            {data && (
              <p className="text-xs text-[#7a6f68]">
                {data.clientName} · {data.serviceName} · {shortDate(data.startISO)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[#9a8f87] hover:text-[#044e77] text-xl leading-none" aria-label="Close">×</button>
        </div>

        {!data && !error && <p className="text-sm text-[#7a6f68]">Loading…</p>}

        {data && card && cash && (
          <>
            <div className="text-sm space-y-1.5 border-b border-[#f0ebe4] pb-3 mb-3">
              <Row label="Price" value={money(data.amountCents)} />
              {data.cashDiscountCents > 0 ? (
                <Row label="Cash/PayID discount" value={`−${money(data.cashDiscountCents)}`} green />
              ) : data.cashDiscountAvailableCents > 0 && card.balanceBeforeCents > 0 ? (
                <Row label="Cash/PayID discount" value={`−${money(cash.cashDiscountCents)} if paid cash or PayID`} muted />
              ) : null}
              {loyaltyCents > 0 && (
                <Row
                  label={data.loyaltyDiscountCents > 0 ? "Loyalty reward" : "Loyalty reward (due now)"}
                  value={`−${money(loyaltyCents)}`}
                  green
                />
              )}
              {data.couponDiscountCents > 0 && <Row label="Coupon" value={`−${money(data.couponDiscountCents)}`} green />}
              {data.payments.map((p) => (
                <Row
                  key={p.id}
                  label={`Paid · ${METHOD_LABEL[p.method]} · ${shortDate(p.paid_at)}`}
                  value={`−${money(p.amount_cents)}`}
                />
              ))}
            </div>

            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-medium text-[#1a1a1a]">Balance owing</span>
              <span className="text-xl font-medium text-[#044e77]">{money(card.balanceBeforeCents)}</span>
            </div>
            {cash.balanceBeforeCents !== card.balanceBeforeCents && (
              <p className="text-xs text-[#7a6f68] text-right mb-3">{money(cash.balanceBeforeCents)} if paid cash or PayID</p>
            )}
            {card.overpaidCents > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Already paid {money(card.overpaidCents)} more than is owed after discounts — refund this to the client.
              </p>
            )}

            {nothingOwing ? (
              !alreadyCompleted && (
                <button
                  disabled={saving}
                  onClick={() => submit("not_paid")}
                  className="w-full py-3 rounded-xl bg-[#044e77] text-white text-sm font-medium disabled:opacity-50 mt-2"
                >
                  {saving ? "Saving…" : "Complete — nothing owing"}
                </button>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <PayButton disabled={saving} onClick={() => submit("cash")} label="Paid cash" amount={money(cash.balanceBeforeCents)} />
                <PayButton disabled={saving} onClick={() => submit("payid")} label="Paid PayID / bank transfer" amount={money(data.options.payid.balanceBeforeCents)} />
                <PayButton disabled={saving} onClick={() => submit("card")} label="Paid card" amount={money(card.balanceBeforeCents)} />
                {!alreadyCompleted && (
                  <button
                    disabled={saving}
                    onClick={() => submit("not_paid")}
                    className="rounded-xl border border-[#ddd8d2] px-3 py-3 text-sm text-[#5a504a] hover:border-[#c0b4ab] disabled:opacity-50"
                  >
                    Not paid yet
                  </button>
                )}
              </div>
            )}

            {!nothingOwing && (
              <div className="mt-3">
                {!showOther ? (
                  <button onClick={() => setShowOther(true)} className="text-xs text-[#7a6f68] underline">
                    Other amount (part payment)
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={otherChoice}
                      onChange={(e) => setOtherChoice(e.target.value as typeof otherChoice)}
                      className="border border-[#ddd8d2] rounded-lg px-2 py-2 text-sm"
                    >
                      <option value="cash">Cash</option>
                      <option value="payid">PayID / bank</option>
                      <option value="card">Card</option>
                    </select>
                    <span className="text-sm text-[#7a6f68]">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={otherAmount}
                      onChange={(e) => setOtherAmount(e.target.value)}
                      className="w-24 border border-[#ddd8d2] rounded-lg px-2 py-2 text-sm"
                    />
                    <button
                      disabled={saving}
                      onClick={submitOther}
                      className="px-3 py-2 rounded-lg bg-[#044e77] text-white text-sm disabled:opacity-50"
                    >
                      Record
                    </button>
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-[#9a8f87] mt-4">
              &ldquo;Paid card&rdquo; records a payment taken on the studio Square terminal — it doesn&rsquo;t charge the card.
            </p>
          </>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, green, muted }: { label: string; value: string; green?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className={muted ? "text-[#9a8f87]" : "text-[#5a504a]"}>{label}</span>
      <span className={`text-right ${green ? "text-emerald-700" : muted ? "text-[#9a8f87] text-xs" : "text-[#1a1a1a]"}`}>{value}</span>
    </div>
  );
}

function PayButton({ label, amount, onClick, disabled }: { label: string; amount: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl bg-[#044e77] hover:bg-[#033d5c] text-white px-3 py-3 text-sm font-medium disabled:opacity-50 flex flex-col items-center"
    >
      <span>{label}</span>
      <span className="text-xs font-light opacity-90">{amount}</span>
    </button>
  );
}
