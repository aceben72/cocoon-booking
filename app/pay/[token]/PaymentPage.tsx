"use client";

import { useState, useEffect, useRef } from "react";

const DEPOSIT_CENTS = 5000; // $50 — must match StepPayment

const SQUARE_APP_ID       = process.env.NEXT_PUBLIC_SQUARE_APP_ID ?? "";
const SQUARE_LOCATION_ID  = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";
const SQUARE_ENV          = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT ?? "sandbox";
const SQUARE_SDK_URL      = SQUARE_ENV === "production"
  ? "https://web.squarecdn.com/v1/square.js"
  : "https://sandbox.web.squarecdn.com/v1/square.js";

declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId: string) => Promise<SquarePayments>;
    };
  }
}
interface SquarePayments { card: () => Promise<SquareCard>; }
interface SquareCard {
  attach: (s: string) => Promise<void>;
  tokenize: () => Promise<{ status: string; token?: string; errors?: { message: string }[] }>;
  destroy: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtPrice(cents: number) { return `$${(cents / 100).toFixed(0)}`; }

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(iso));
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  token: string;
  appointmentId: string;
  serviceName: string;
  serviceCategory: string;
  priceCents: number;
  startISO: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
}

export function PaymentPage({
  token,
  serviceName,
  serviceCategory,
  priceCents,
  startISO,
  clientFirstName,
  clientLastName,
  clientEmail,
}: Props) {
  const hasDepositOption = !["brow-treatments", "led-light-treatments"].includes(serviceCategory);
  const [paymentMode, setPaymentMode] = useState<"full" | "deposit">("full");
  const amountPaidCents = hasDepositOption && paymentMode === "deposit" ? DEPOSIT_CENTS : priceCents;

  const [sdkReady,   setSdkReady]   = useState(false);
  const [cardReady,  setCardReady]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [confirmed,  setConfirmed]  = useState(false);

  const cardRef     = useRef<SquareCard | null>(null);
  const paymentsRef = useRef<SquarePayments | null>(null);

  useEffect(() => {
    let aborted = false;

    const init = async () => {
      if (!window.Square) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = SQUARE_SDK_URL;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Square SDK"));
          document.head.appendChild(s);
        });
      }
      if (aborted || !window.Square) return;
      setSdkReady(true);

      try {
        const payments = await window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        if (aborted) return;
        paymentsRef.current = payments;
        const card = await payments.card();
        if (aborted) { card.destroy().catch(() => {}); return; }
        await card.attach("#pay-card-container");
        if (aborted) { card.destroy().catch(() => {}); return; }
        cardRef.current = card;
        setCardReady(true);
      } catch (err) {
        console.error("[PaymentPage Square init]", err);
        if (!aborted) setError("Could not load payment form. Please refresh and try again.");
      }
    };

    init();
    return () => {
      aborted = true;
      cardRef.current?.destroy().catch(() => {});
      cardRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePay = async () => {
    if (!cardRef.current || submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== "OK" || !result.token) {
        setError(result.errors?.[0]?.message ?? "Card tokenisation failed.");
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/pay/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squarePaymentToken: result.token, amountPaidCents }),
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Payment failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setConfirmed(true);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  if (confirmed) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-5xl mb-6">✨</p>
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-4xl text-[#044e77] mb-4">
          You&apos;re confirmed!
        </h1>
        <p className="text-[#7a6f68] mb-6 text-base">
          Hi {clientFirstName}, your {serviceName} on {fmtDate(startISO)} at {fmtTime(startISO)} is confirmed.
          A confirmation has been sent to {clientEmail}.
        </p>
        <p className="text-sm text-[#b0a499] italic">Relax. Revive. Restore.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8 text-center">
        <p className="text-xs text-[#b0a499] font-light mb-1 uppercase tracking-wider">
          Cocoon Skin &amp; Beauty
        </p>
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-3xl text-[#044e77]">
          Complete your booking
        </h1>
      </div>

      {/* Booking summary — locked/read-only */}
      <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 mb-5">
        <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
          Your reservation
        </h2>
        <div className="space-y-3 text-sm">
          <SummaryRow label="Service"    value={serviceName} />
          <SummaryRow label="Date"       value={fmtDate(startISO)} />
          <SummaryRow label="Time"       value={fmtTime(startISO)} />
          <SummaryRow label="Name"       value={`${clientFirstName} ${clientLastName}`} />
          <div className="pt-3 border-t border-[#f0ebe4] space-y-1.5">
            {paymentMode === "deposit" ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#9a8f87] font-light">Service total</span>
                  <span className="text-[#1a1a1a] font-light">{fmtPrice(priceCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#3a3330]">Due today</span>
                  <span className="text-xl font-[family-name:var(--font-cormorant)] font-medium text-[#044e77]">
                    {fmtPrice(DEPOSIT_CENTS)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#9a8f87] font-light">Remaining at appointment</span>
                  <span className="text-[#9a8f87] font-light">{fmtPrice(priceCents - DEPOSIT_CENTS)}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#3a3330]">Total due today</span>
                <span className="text-xl font-[family-name:var(--font-cormorant)] font-medium text-[#044e77]">
                  {fmtPrice(priceCents)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment option selector */}
      {hasDepositOption && (
        <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 mb-5">
          <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
            Payment option
          </h2>
          <div className="space-y-3">
            <PayOption
              selected={paymentMode === "full"}
              onClick={() => setPaymentMode("full")}
              title={`Pay in full — ${fmtPrice(priceCents)} today`}
            />
            <PayOption
              selected={paymentMode === "deposit"}
              onClick={() => setPaymentMode("deposit")}
              title={`Pay deposit — ${fmtPrice(DEPOSIT_CENTS)} today, remainder due at appointment`}
            />
          </div>
        </div>
      )}

      {/* Card form */}
      <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 mb-5">
        <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
          Card details
        </h2>

        {!sdkReady && (
          <div className="flex items-center gap-2 text-sm text-[#9a8f87] font-light py-4">
            <div className="w-4 h-4 border-2 border-[#e8e0d8] border-t-[#044e77] rounded-full animate-spin" />
            Loading secure payment form…
          </div>
        )}

        <div id="pay-card-container" className={!cardReady ? "hidden" : ""} style={{ minHeight: "89px" }} />
        <style>{`
          #pay-card-container .sq-card-postal-code,
          #pay-card-container .postal-code-wrapper,
          #pay-card-container [data-field-type="postalCode"] { display: none !important; }
        `}</style>

        <p className="text-xs text-[#b0a499] font-light mt-3 flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd" />
          </svg>
          Secured by Square · Your card details are never stored by Cocoon
        </p>
      </div>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={!cardReady || submitting}
        className={[
          "w-full rounded-xl py-4 px-6 font-medium text-white transition-all",
          cardReady && !submitting
            ? "bg-[#044e77] hover:bg-[#033d5c] active:bg-[#022d44]"
            : "bg-[#b0c4d4] cursor-not-allowed",
        ].join(" ")}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Processing payment…
          </span>
        ) : (
          `Confirm & Pay ${fmtPrice(amountPaidCents)}`
        )}
      </button>

      <p className="text-xs text-center text-[#b0a499] font-light mt-3">
        By confirming you agree to our cancellation policy.
        Please provide 48 hours notice to cancel or reschedule.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[#9a8f87] font-light shrink-0">{label}</span>
      <span className="text-[#1a1a1a] text-right font-light">{value}</span>
    </div>
  );
}

function PayOption({ selected, onClick, title }: { selected: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl border-2 px-4 py-3.5 flex items-center gap-3 transition-colors",
        selected ? "border-[#044e77] bg-[#044e77]/5" : "border-[#e8e0d8] hover:border-[#c8bfb8]",
      ].join(" ")}
    >
      <div className={[
        "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
        selected ? "border-[#044e77]" : "border-[#c8bfb8]",
      ].join(" ")}>
        {selected && <div className="w-2 h-2 rounded-full bg-[#044e77]" />}
      </div>
      <span className={`text-sm font-light ${selected ? "text-[#044e77] font-medium" : "text-[#3a3330]"}`}>
        {title}
      </span>
    </button>
  );
}
