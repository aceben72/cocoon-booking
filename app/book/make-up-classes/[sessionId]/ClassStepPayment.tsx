"use client";

import { useState, useEffect, useRef } from "react";
import type { ClassSessionWithAvailability, ClientDetailsForm } from "@/types";
import type { ClassBookingResult } from "./ClassBookingWizard";

interface Props {
  session: ClassSessionWithAvailability & { title: string };
  client: ClientDetailsForm;
  quantity: number;
  onSuccess: (result: ClassBookingResult) => void;
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

const SQUARE_PRICE_CENTS  = 8900; // $89 per ticket
const SQUARE_APP_ID       = process.env.NEXT_PUBLIC_SQUARE_APP_ID ?? "";
const SQUARE_LOCATION_ID  = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";
const SQUARE_ENV          = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT ?? "sandbox";
const SQUARE_SDK_URL      = SQUARE_ENV === "production"
  ? "https://web.squarecdn.com/v1/square.js"
  : "https://sandbox.web.squarecdn.com/v1/square.js";

function formatDateTime(iso: string) {
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return { date, time };
}

export default function ClassStepPayment({ session, client, quantity, onSuccess, onError, onBack }: Props) {
  const [sdkReady, setSdkReady]   = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const cardRef     = useRef<SquareCard | null>(null);
  const paymentsRef = useRef<SquarePayments | null>(null);

  const totalCents = SQUARE_PRICE_CENTS * quantity;

  const { date: displayDate, time: displayTime } = formatDateTime(session.start_datetime);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
        if (aborted) { card.destroy().catch(() => {}); return; }
        await card.attach("#class-card-container");
        if (aborted) { card.destroy().catch(() => {}); return; }
        cardRef.current = card;
        setCardReady(true);
      } catch (err) {
        console.error("[Square class init error]", err);
        if (!aborted) onError("Could not initialise payment form. Please refresh and try again.");
      }
    };

    loadAndInit();
    return () => {
      aborted = true;
      cardRef.current?.destroy().catch(() => {});
      cardRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!cardRef.current || submitting) return;
    setSubmitting(true);

    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== "OK" || !result.token) {
        onError(result.errors?.[0]?.message ?? "Card tokenisation failed.");
        setSubmitting(false);
        return;
      }

      const response = await fetch("/api/class-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          client,
          squarePaymentToken: result.token,
          quantity,
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
        <h3 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">Booking summary</h3>
        <div className="space-y-3">
          {[
            { label: "Class",    value: session.title },
            { label: "Duration", value: "3 hours" },
            { label: "Date",     value: displayDate },
            { label: "Time",     value: displayTime },
            { label: "Name",     value: `${client.first_name} ${client.last_name}` },
            { label: "Tickets",  value: `${quantity} × $89` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-[#9a8f87] font-light shrink-0">{label}</span>
              <span className="text-[#1a1a1a] text-right font-light">{value}</span>
            </div>
          ))}
          <div className="pt-3 border-t border-[#f0ebe4] flex items-center justify-between">
            <span className="text-sm font-medium text-[#3a3330]">Total due today</span>
            <span className="text-xl font-[family-name:var(--font-cormorant)] font-medium text-[#044e77]">
              ${totalCents / 100}
            </span>
          </div>
        </div>
      </div>

      {/* Card form */}
      <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 mb-5">
        <h3 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">Card details</h3>

        {!sdkReady && (
          <div className="flex items-center gap-2 text-sm text-[#9a8f87] font-light py-4">
            <div className="w-4 h-4 border-2 border-[#e8e0d8] border-t-[#044e77] rounded-full animate-spin" />
            Loading secure payment form...
          </div>
        )}

        <div
          id="class-card-container"
          className={!cardReady ? "hidden" : ""}
          style={{ minHeight: "89px" }}
        />
        <style>{`
          #class-card-container .sq-card-postal-code,
          #class-card-container .postal-code-wrapper,
          #class-card-container [data-field-type="postalCode"] { display: none !important; }
        `}</style>

        <p className="text-xs text-[#b0a499] font-light mt-3 flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Secured by Square · Your card details are never stored by Cocoon
        </p>
      </div>

      <button
        onClick={handleSubmit}
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
            Processing payment...
          </span>
        ) : (
          `Confirm & Pay $${totalCents / 100}`
        )}
      </button>

      <p className="text-xs text-center text-[#b0a499] font-light mt-3">
        By confirming you agree to our cancellation policy. Please provide 24 hours notice to cancel.
      </p>
    </div>
  );
}
