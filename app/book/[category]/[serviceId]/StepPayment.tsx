"use client";

import { useState, useEffect, useRef } from "react";
import type { Service, ClientDetailsForm } from "@/types";
import { formatPrice, formatDuration, formatTime } from "@/lib/utils";

interface BookingResult {
  appointmentId: string;
  service: { name: string; duration_minutes: number };
  startISO: string;
  amountCents: number;
  amountPaidCents: number;
  isNewClient?: boolean;
  client: { first_name: string; last_name: string; email: string };
}

const DEFAULT_DEPOSIT_CENTS = 5000; // $50 — overridden per service via service.deposit_cents

interface Props {
  service: Service;
  date: string;
  time: string;
  client: ClientDetailsForm;
  onSuccess: (result: BookingResult) => void;
  onError: (msg: string) => void;
  onBack: () => void;
}

declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId: string) => Promise<SquarePayments>;
    };
  }
}

interface SquarePayments {
  card: () => Promise<SquareCard>;
}

interface SquareCard {
  attach: (selector: string) => Promise<void>;
  tokenize: () => Promise<{ status: string; token?: string; errors?: { message: string }[] }>;
  destroy: () => Promise<void>;
}

const SQUARE_APP_ID = process.env.NEXT_PUBLIC_SQUARE_APP_ID ?? "";
const SQUARE_LOCATION_ID = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";
const SQUARE_ENV = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT ?? "sandbox";
const SQUARE_SDK_URL =
  SQUARE_ENV === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";

export default function StepPayment({ service, date, time, client, onSuccess, onError, onBack }: Props) {
  // Only certain categories offer the deposit option; all others pay in full.
  const hasDepositOption = !["brow-treatments", "led-light-treatments"].includes(service.category);
  const DEPOSIT_CENTS = service.deposit_cents ?? DEFAULT_DEPOSIT_CENTS;
  const [paymentMode, setPaymentMode] = useState<"full" | "deposit">("full");

  // ── Promotions state ──────────────────────────────────────────
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardValidating, setGiftCardValidating] = useState(false);
  const [giftCardError, setGiftCardError] = useState("");
  const [appliedGiftCard, setAppliedGiftCard] = useState<{
    code: string;
    remaining_value_cents: number;
  } | null>(null);

  const [couponCode, setCouponCode] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountCents: number;
    label: string; // e.g. "20% off" or "$10 off"
  } | null>(null);

  // ── Price calculation ─────────────────────────────────────────
  const baseAmountCents = hasDepositOption && paymentMode === "deposit"
    ? DEPOSIT_CENTS
    : service.price_cents;

  // Coupon discount applies to the service total (not deposit)
  const couponDiscountCents = appliedCoupon?.discountCents ?? 0;
  // Gift card covers what's left after coupon
  const afterCoupon = Math.max(0, service.price_cents - couponDiscountCents);
  const giftCardApplied = appliedGiftCard
    ? Math.min(appliedGiftCard.remaining_value_cents, afterCoupon)
    : 0;

  // Amount to charge to card: baseAmount - coupon - gift card (but at least 0)
  let amountPaidCents: number;
  if (paymentMode === "deposit") {
    // For deposit mode: discount from deposit amount only
    amountPaidCents = Math.max(0, DEPOSIT_CENTS - couponDiscountCents - giftCardApplied);
  } else {
    amountPaidCents = Math.max(0, service.price_cents - couponDiscountCents - giftCardApplied);
  }

  // Square requires minimum 50 cents — if discounts cover everything, we do $0 payment (no card needed)
  const needsCardPayment = amountPaidCents >= 50;

  const [sdkReady, setSdkReady] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const cardRef = useRef<SquareCard | null>(null);
  const paymentsRef = useRef<SquarePayments | null>(null);

  const displayDate = formatDateDisplay(date);

  // Load Square SDK and initialise card (only when card payment is needed)
  useEffect(() => {
    if (!needsCardPayment || typeof window === "undefined") return;

    let aborted = false;

    const loadAndInit = async () => {
      if (!window.Square) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = SQUARE_SDK_URL;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Square SDK"));
          document.head.appendChild(script);
        });
      }

      if (aborted) return;

      if (!window.Square) {
        onError("Square payment SDK failed to load. Please refresh and try again.");
        return;
      }

      setSdkReady(true);

      try {
        const payments = await window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        if (aborted) return;

        paymentsRef.current = payments;
        const card = await payments.card();
        if (aborted) {
          card.destroy().catch(() => {});
          return;
        }

        await card.attach("#square-card-container");
        if (aborted) {
          card.destroy().catch(() => {});
          return;
        }

        cardRef.current = card;
        setCardReady(true);
      } catch (err) {
        console.error("[Square init error]", err);
        if (!aborted) {
          onError("Could not initialise payment form. Please refresh and try again.");
        }
      }
    };

    loadAndInit();

    return () => {
      aborted = true;
      cardRef.current?.destroy().catch(() => {});
      cardRef.current = null;
      setCardReady(false);
      setSdkReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsCardPayment]);

  // ── Gift card validation ───────────────────────────────────────
  const handleApplyGiftCard = async () => {
    if (!giftCardCode.trim()) return;
    setGiftCardValidating(true);
    setGiftCardError("");
    try {
      const res = await fetch("/api/validate-gift-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: giftCardCode }),
      });
      const data = await res.json();
      if (data.valid && data.giftCard) {
        setAppliedGiftCard({
          code: data.giftCard.code,
          remaining_value_cents: data.giftCard.remaining_value_cents,
        });
        setGiftCardCode("");
      } else {
        setGiftCardError(data.error ?? "Invalid gift card.");
      }
    } catch {
      setGiftCardError("Could not validate gift card. Please try again.");
    } finally {
      setGiftCardValidating(false);
    }
  };

  // ── Coupon validation ─────────────────────────────────────────
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponValidating(true);
    setCouponError("");
    try {
      const res = await fetch("/api/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode,
          category: service.category,
          amountCents: service.price_cents,
        }),
      });
      const data = await res.json();
      if (data.valid && data.coupon) {
        const label = data.coupon.type === "percentage"
          ? `${data.coupon.value}% off`
          : `${formatPrice(data.discountCents)} off`;
        setAppliedCoupon({
          code: data.coupon.code,
          discountCents: data.discountCents,
          label,
        });
        setCouponCode("");
      } else {
        setCouponError(data.error ?? "Invalid discount code.");
      }
    } catch {
      setCouponError("Could not validate discount code. Please try again.");
    } finally {
      setCouponValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (needsCardPayment && (!cardRef.current || submitting)) return;
    if (!needsCardPayment && submitting) return;
    setSubmitting(true);

    try {
      let squarePaymentToken = "NO_CHARGE";

      if (needsCardPayment) {
        const result = await cardRef.current!.tokenize();
        if (result.status !== "OK" || !result.token) {
          const msg = result.errors?.[0]?.message ?? "Card tokenisation failed.";
          onError(msg);
          setSubmitting(false);
          return;
        }
        squarePaymentToken = result.token;
      }

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          date,
          time,
          client,
          squarePaymentToken,
          amountPaidCents,
          giftCardCode: appliedGiftCard?.code ?? null,
          couponCode: appliedCoupon?.code ?? null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        onError(data.error ?? "Booking failed. Please try again.");
        setSubmitting(false);
        return;
      }

      onSuccess(data);
    } catch {
      onError("An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  const canSubmit = needsCardPayment ? (cardReady && !submitting) : !submitting;

  return (
    <div>
      <button
        onClick={onBack}
        disabled={submitting}
        className="inline-flex items-center gap-1 text-sm text-[#7a6f68] hover:text-[#044e77] mb-6 transition-colors font-light disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Change details
      </button>

      <h2 className="font-[family-name:var(--font-cormorant)] text-3xl font-light italic text-[#044e77] mb-6">
        Confirm & pay
      </h2>

      {/* Booking summary */}
      <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 mb-5">
        <h3 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
          Booking summary
        </h3>
        <div className="space-y-3">
          <SummaryRow label="Service" value={service.name} />
          <SummaryRow label="Duration" value={formatDuration(service.duration_minutes)} />
          <SummaryRow label="Date" value={displayDate} />
          <SummaryRow label="Time" value={formatTime(time)} />
          <SummaryRow label="Name" value={`${client.first_name} ${client.last_name}`} />
          <div className="pt-3 border-t border-[#f0ebe4] space-y-1.5">
            {/* Service total */}
            {(couponDiscountCents > 0 || giftCardApplied > 0) && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#9a8f87] font-light">Service total</span>
                <span className="text-[#1a1a1a] font-light">{formatPrice(service.price_cents)}</span>
              </div>
            )}
            {/* Coupon discount line */}
            {appliedCoupon && couponDiscountCents > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-700 font-light">
                  Discount ({appliedCoupon.label})
                </span>
                <span className="text-emerald-700 font-light">−{formatPrice(couponDiscountCents)}</span>
              </div>
            )}
            {/* Gift card line */}
            {appliedGiftCard && giftCardApplied > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-700 font-light">
                  Gift card ({appliedGiftCard.code})
                </span>
                <span className="text-emerald-700 font-light">−{formatPrice(giftCardApplied)}</span>
              </div>
            )}
            {/* Deposit mode breakdown */}
            {paymentMode === "deposit" && amountPaidCents >= 50 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#3a3330]">Due today (deposit)</span>
                  <span className="text-xl font-[family-name:var(--font-cormorant)] font-medium text-[#044e77]">
                    {formatPrice(amountPaidCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#9a8f87] font-light">Remaining at appointment</span>
                  <span className="text-[#9a8f87] font-light">
                    {formatPrice(service.price_cents - couponDiscountCents - giftCardApplied - amountPaidCents)}
                  </span>
                </div>
              </>
            ) : amountPaidCents === 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#3a3330]">Due today</span>
                <span className="text-xl font-[family-name:var(--font-cormorant)] font-medium text-emerald-700">
                  Free ✓
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#3a3330]">Due today</span>
                <span className="text-xl font-[family-name:var(--font-cormorant)] font-medium text-[#044e77]">
                  {formatPrice(amountPaidCents)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment option selector — only for categories that allow a deposit */}
      {hasDepositOption && (
        <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 mb-5">
          <h3 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
            Payment option
          </h3>
          <div className="space-y-3">
            <PaymentOption
              id="pay-full"
              selected={paymentMode === "full"}
              onClick={() => setPaymentMode("full")}
              title={`Pay in full — ${formatPrice(service.price_cents)} today`}
            />
            <PaymentOption
              id="pay-deposit"
              selected={paymentMode === "deposit"}
              onClick={() => setPaymentMode("deposit")}
              title={`Pay deposit — ${formatPrice(DEPOSIT_CENTS)} today, remainder due at appointment`}
            />
          </div>
        </div>
      )}

      {/* Promotions — gift card and discount code */}
      <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 mb-5">
        <h3 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
          Promotions
        </h3>

        {/* Gift card */}
        <div className="mb-4">
          <p className="text-xs text-[#7a6f68] font-light mb-2">Gift card</p>
          {appliedGiftCard ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <span className="text-sm text-emerald-800 font-light">
                {appliedGiftCard.code}{" "}
                <span className="text-emerald-600">
                  ({formatPrice(appliedGiftCard.remaining_value_cents)} available)
                </span>
              </span>
              <button
                type="button"
                onClick={() => setAppliedGiftCard(null)}
                className="text-xs text-emerald-700 hover:text-red-600 ml-3 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={giftCardCode}
                onChange={(e) => { setGiftCardCode(e.target.value.toUpperCase()); setGiftCardError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleApplyGiftCard()}
                placeholder="GIFT-XXXX-XXXX"
                className="flex-1 rounded-xl border border-[#e8e0d8] px-4 py-2.5 text-sm font-light focus:outline-none focus:border-[#044e77] uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal"
              />
              <button
                type="button"
                onClick={handleApplyGiftCard}
                disabled={!giftCardCode.trim() || giftCardValidating}
                className="rounded-xl border border-[#044e77] text-[#044e77] px-4 py-2.5 text-sm font-light hover:bg-[#044e77] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {giftCardValidating ? "Checking…" : "Apply"}
              </button>
            </div>
          )}
          {giftCardError && (
            <p className="text-xs text-red-600 mt-1.5 font-light">{giftCardError}</p>
          )}
        </div>

        {/* Discount code */}
        <div>
          <p className="text-xs text-[#7a6f68] font-light mb-2">Discount code</p>
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <span className="text-sm text-emerald-800 font-light">
                {appliedCoupon.code}{" "}
                <span className="text-emerald-600">({appliedCoupon.label})</span>
              </span>
              <button
                type="button"
                onClick={() => setAppliedCoupon(null)}
                className="text-xs text-emerald-700 hover:text-red-600 ml-3 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                placeholder="SUMMER20"
                className="flex-1 rounded-xl border border-[#e8e0d8] px-4 py-2.5 text-sm font-light focus:outline-none focus:border-[#044e77] uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={!couponCode.trim() || couponValidating}
                className="rounded-xl border border-[#044e77] text-[#044e77] px-4 py-2.5 text-sm font-light hover:bg-[#044e77] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {couponValidating ? "Checking…" : "Apply"}
              </button>
            </div>
          )}
          {couponError && (
            <p className="text-xs text-red-600 mt-1.5 font-light">{couponError}</p>
          )}
        </div>
      </div>

      {/* Card form — hidden when full amount is covered by discounts */}
      {needsCardPayment && (
        <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 mb-5">
          <h3 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
            Card details
          </h3>

          {!sdkReady && (
            <div className="flex items-center gap-2 text-sm text-[#9a8f87] font-light py-4">
              <div className="w-4 h-4 border-2 border-[#e8e0d8] border-t-[#044e77] rounded-full animate-spin" />
              Loading secure payment form...
            </div>
          )}

          <div
            id="square-card-container"
            className={!cardReady ? "hidden" : ""}
            style={{ minHeight: "89px" }}
          />
          <style>{`
            #square-card-container .sq-card-postal-code,
            #square-card-container .postal-code-wrapper,
            #square-card-container [data-field-type="postalCode"] { display: none !important; }
          `}</style>

          <p className="text-xs text-[#b0a499] font-light mt-3 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Secured by Square · Your card details are never stored by Cocoon
          </p>
        </div>
      )}

      {/* Free booking notice */}
      {!needsCardPayment && amountPaidCents === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5 text-sm text-emerald-800 font-light">
          Your promotions cover the full amount — no payment required today.
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={[
          "w-full rounded-xl py-4 px-6 font-medium text-white transition-all",
          canSubmit
            ? "bg-[#044e77] hover:bg-[#033d5c] active:bg-[#022d44]"
            : "bg-[#b0c4d4] cursor-not-allowed",
        ].join(" ")}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            {needsCardPayment ? "Processing payment..." : "Confirming booking..."}
          </span>
        ) : amountPaidCents === 0 ? (
          "Confirm booking"
        ) : (
          `Confirm & Pay ${formatPrice(amountPaidCents)}`
        )}
      </button>

      <p className="text-xs text-center text-[#b0a499] font-light mt-3">
        By confirming you agree to our cancellation policy.
        Please provide 48 hours notice to cancel or reschedule.
      </p>
    </div>
  );
}

function PaymentOption({
  id,
  selected,
  onClick,
  title,
}: {
  id: string;
  selected: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl border-2 px-4 py-3.5 flex items-center gap-3 transition-colors",
        selected
          ? "border-[#044e77] bg-[#044e77]/5"
          : "border-[#e8e0d8] hover:border-[#c8bfb8]",
      ].join(" ")}
    >
      <div
        className={[
          "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
          selected ? "border-[#044e77]" : "border-[#c8bfb8]",
        ].join(" ")}
      >
        {selected && <div className="w-2 h-2 rounded-full bg-[#044e77]" />}
      </div>
      <span className={`text-sm font-light ${selected ? "text-[#044e77] font-medium" : "text-[#3a3330]"}`}>
        {title}
      </span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-[#9a8f87] font-light shrink-0">{label}</span>
      <span className="text-[#1a1a1a] text-right font-light">{value}</span>
    </div>
  );
}

function formatDateDisplay(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
