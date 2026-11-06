"use client";

import { useEffect, useState } from "react";
import { METHOD_LABEL, paidBalanceText, type CompleteChoice, type CompletionResult, type PaymentMethod } from "@/lib/complete-payment";
import { GiftCardPicker, type PickedGiftCard } from "@/components/GiftCardPicker";

interface Breakdown {
  status: string;
  serviceName: string;
  extraDaughters?: number;
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
 *
 * Gift card: covers part or all of the balance first; the buttons then pay
 * the rest (split payment, one transaction). "Record now, don't complete"
 * takes a deposit or gift card before the appointment.
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
  // Gift card (split payment)
  const [useGift, setUseGift] = useState(false);
  const [giftCard, setGiftCard] = useState<PickedGiftCard | null>(null);
  const [giftAmount, setGiftAmount] = useState("");
  // Take a payment now without completing (deposit before the appointment)
  const [recordOnly, setRecordOnly] = useState(false);

  async function load() {
    setError(null);
    const res = await fetch(`/api/admin/appointments/${appointmentId}/payment`);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Failed to load"); return; }
    setData(d as Breakdown);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [appointmentId]);

  const card = data?.options.card;
  const cash = data?.options.cash;
  const owingCardCents = card?.balanceBeforeCents ?? 0;

  function pickGiftCard(c: PickedGiftCard | null) {
    setGiftCard(c);
    setError(null);
    setGiftAmount(c ? String(Math.min(c.remaining_value_cents, owingCardCents) / 100) : "");
  }

  const giftCents = useGift && giftCard ? Math.round(Number(giftAmount) * 100) : 0;
  const giftValid = !useGift || (!!giftCard && Number.isFinite(giftCents) && giftCents > 0
    && giftCents <= giftCard.remaining_value_cents && giftCents <= owingCardCents);

  async function submit(choice: CompleteChoice, otherAmountCents?: number) {
    if (!data) return;
    if (useGift && !giftCard) { setError("Choose a gift card or check its code"); return; }
    if (useGift && !giftValid) {
      setError(`Gift card amount must be more than $0 and no more than ${money(Math.min(giftCard?.remaining_value_cents ?? 0, owingCardCents))}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choice,
          otherAmountCents,
          expectedPaidCents: data.amountPaidCents,
          ...(useGift && giftCard ? { giftCardCode: giftCard.code, giftCardCents: giftCents } : {}),
          ...(recordOnly ? { complete: false } : {}),
        }),
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

  const loyaltyCents = data ? (data.loyaltyDiscountCents || data.loyaltyRewardDueCents) : 0;
  const nothingOwing = !!card && card.balanceBeforeCents === 0;
  const alreadyCompleted = data?.status === "completed";

  // After the gift card: what's left at the card price, and with the cash/PayID
  // discount (it's on the price, so it still applies to the rest in full).
  const restCard = Math.max(0, owingCardCents - giftCents);
  const cashOff = data && data.cashDiscountCents === 0 ? Math.min(data.cashDiscountAvailableCents, restCard) : 0;
  const restCash = restCard - cashOff;
  const giftCoversAll = useGift && !!giftCard && giftValid && restCard === 0;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-2xl">
              {alreadyCompleted || recordOnly ? "Record payment" : "Complete appointment"}
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
              <Row
                label={data.extraDaughters ? `Price (incl. ${data.extraDaughters} extra daughter${data.extraDaughters > 1 ? "s" : ""})` : "Price"}
                value={money(data.amountCents)}
              />
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
                  label={`Paid · ${METHOD_LABEL[p.method]}${p.method === "gift_card" && p.notes ? ` ${p.notes}` : ""} · ${shortDate(p.paid_at)}`}
                  value={`−${money(p.amount_cents)}`}
                />
              ))}
            </div>

            {data.amountPaidCents > 0 && card.balanceBeforeCents > 0 && (
              <p className="text-sm text-[#5a504a] mb-1">{paidBalanceText(data.amountPaidCents, card.balanceBeforeCents)}</p>
            )}
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

            {/* Gift card — pays first; the buttons below pay the rest */}
            {!nothingOwing && (
              <div className="mt-3 border border-[#e8e0d8] rounded-xl p-3">
                <label className="flex items-center gap-2 text-sm text-[#1a1a1a]">
                  <input
                    type="checkbox"
                    checked={useGift}
                    onChange={(e) => { setUseGift(e.target.checked); if (!e.target.checked) pickGiftCard(null); }}
                  />
                  Gift card
                </label>
                {useGift && (
                  <div className="mt-2 space-y-2">
                    <GiftCardPicker lookup={`appointmentId=${appointmentId}`} picked={giftCard} onPick={pickGiftCard} />
                    {giftCard && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-[#7a6f68]">Use $</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          value={giftAmount}
                          onChange={(e) => setGiftAmount(e.target.value)}
                          className="w-24 border border-[#ddd8d2] rounded-lg px-2 py-2 text-sm"
                        />
                        <span className="text-xs text-[#7a6f68]">
                          {giftValid
                            ? restCard > 0
                              ? `then ${money(restCard)} by card, or ${money(restCash)} cash/PayID`
                              : "covers the balance"
                            : `max ${money(Math.min(giftCard.remaining_value_cents, owingCardCents))}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!alreadyCompleted && !nothingOwing && (
              <label className="flex items-center gap-2 text-xs text-[#5a504a] mt-3">
                <input
                  type="checkbox"
                  checked={recordOnly}
                  onChange={(e) => { setRecordOnly(e.target.checked); if (e.target.checked) setShowOther(true); }}
                />
                Record now, don&rsquo;t complete (deposit or gift card before the appointment)
              </label>
            )}

            {recordOnly ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-[#7a6f68]">
                  Discounts are worked out at Complete. A booking waiting on a payment link becomes confirmed.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={otherChoice}
                    onChange={(e) => setOtherChoice(e.target.value as typeof otherChoice)}
                    className="border border-[#ddd8d2] rounded-lg px-2 py-2 text-sm"
                  >
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="payid">PayID / bank</option>
                  </select>
                  <span className="text-sm text-[#7a6f68]">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={otherAmount}
                    onChange={(e) => setOtherAmount(e.target.value)}
                    placeholder={useGift ? "0" : ""}
                    className="w-24 border border-[#ddd8d2] rounded-lg px-2 py-2 text-sm"
                  />
                </div>
                <button
                  disabled={saving}
                  onClick={() => {
                    const cents = otherAmount.trim() ? Math.round(parseFloat(otherAmount) * 100) : 0;
                    if (!Number.isFinite(cents) || cents < 0) { setError("Enter an amount"); return; }
                    if (cents === 0 && !useGift) { setError("Enter an amount or use a gift card"); return; }
                    submit(cents > 0 ? otherChoice : "not_paid", cents > 0 ? cents : undefined);
                  }}
                  className="w-full py-3 rounded-xl bg-[#044e77] text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Record payment"}
                </button>
              </div>
            ) : nothingOwing ? (
              !alreadyCompleted && (
                <button
                  disabled={saving}
                  onClick={() => submit("not_paid")}
                  className="w-full py-3 rounded-xl bg-[#044e77] text-white text-sm font-medium disabled:opacity-50 mt-2"
                >
                  {saving ? "Saving…" : "Complete — nothing owing"}
                </button>
              )
            ) : giftCoversAll ? (
              <button
                disabled={saving}
                onClick={() => submit("card")}
                className="w-full py-3 rounded-xl bg-[#044e77] text-white text-sm font-medium disabled:opacity-50 mt-3"
              >
                {saving ? "Saving…" : `${alreadyCompleted ? "Record" : "Complete"} — gift card pays ${money(giftCents)}`}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <PayButton disabled={saving} onClick={() => submit("cash")} label={useGift ? "Rest paid cash" : "Paid cash"} amount={money(useGift ? restCash : cash.balanceBeforeCents)} />
                <PayButton disabled={saving} onClick={() => submit("payid")} label={useGift ? "Rest paid PayID / bank" : "Paid PayID / bank transfer"} amount={money(useGift ? restCash : data.options.payid.balanceBeforeCents)} />
                <PayButton disabled={saving} onClick={() => submit("card")} label={useGift ? "Rest paid card" : "Paid card"} amount={money(useGift ? restCard : card.balanceBeforeCents)} />
                {!alreadyCompleted && (
                  <button
                    disabled={saving}
                    onClick={() => submit("not_paid")}
                    className="rounded-xl border border-[#ddd8d2] px-3 py-3 text-sm text-[#5a504a] hover:border-[#c0b4ab] disabled:opacity-50"
                  >
                    {useGift ? "Rest not paid yet" : "Not paid yet"}
                  </button>
                )}
              </div>
            )}

            {!nothingOwing && !recordOnly && !giftCoversAll && (
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
