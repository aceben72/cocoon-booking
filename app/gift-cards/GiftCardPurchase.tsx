"use client";

import { useState, useEffect, useRef } from "react";

const DENOMINATIONS = [
  { cents: 5000, label: "$50" },
  { cents: 10000, label: "$100" },
  { cents: 15000, label: "$150" },
  { cents: 20000, label: "$200" },
];

const SQUARE_APP_ID = process.env.NEXT_PUBLIC_SQUARE_APP_ID ?? "";
const SQUARE_LOCATION_ID = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";
const SQUARE_ENV = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT ?? "sandbox";
const SQUARE_SDK_URL =
  SQUARE_ENV === "production"
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
  attach: (selector: string) => Promise<void>;
  tokenize: () => Promise<{ status: string; token?: string; errors?: { message: string }[] }>;
  destroy: () => Promise<void>;
}

interface ConfirmationData {
  code: string;
  denomination_cents: number;
  recipient_name: string;
  recipient_email: string;
}

interface Props {
  initialAmountCents?: number;
}

export default function GiftCardPurchase({ initialAmountCents }: Props) {
  // Denomination
  const initial = DENOMINATIONS.find((d) => d.cents === initialAmountCents) ?? null;
  const [selected, setSelected] = useState<typeof DENOMINATIONS[0] | null>(initial);

  // Form fields
  const [purchaserName, setPurchaserName] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");

  // Square
  const [sdkReady, setSdkReady] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const cardRef = useRef<SquareCard | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);

  // Load Square SDK
  useEffect(() => {
    if (typeof window === "undefined") return;
    let aborted = false;

    const init = async () => {
      if (!window.Square) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = SQUARE_SDK_URL;
          script.onload = () => resolve();
          script.onerror = () => reject();
          document.head.appendChild(script);
        });
      }
      if (aborted || !window.Square) return;
      setSdkReady(true);

      try {
        const payments = await window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        if (aborted) return;
        const card = await payments.card();
        if (aborted) { card.destroy().catch(() => {}); return; }
        await card.attach("#gc-card-container");
        if (aborted) { card.destroy().catch(() => {}); return; }
        cardRef.current = card;
        setCardReady(true);
      } catch (err) {
        console.error("[Square init]", err);
      }
    };

    init();
    return () => {
      aborted = true;
      cardRef.current?.destroy().catch(() => {});
      cardRef.current = null;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) { setError("Please select a denomination."); return; }
    if (!cardRef.current) { setError("Payment form is not ready yet."); return; }
    setSubmitting(true);
    setError("");

    try {
      const tokenResult = await cardRef.current.tokenize();
      if (tokenResult.status !== "OK" || !tokenResult.token) {
        setError(tokenResult.errors?.[0]?.message ?? "Card tokenisation failed.");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/gift-cards/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          denomination_cents: selected.cents,
          purchaser_name: purchaserName,
          purchaser_email: purchaserEmail,
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          personal_message: message || null,
          square_payment_token: tokenResult.token,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Purchase failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setConfirmation(data);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  const reset = () => {
    setConfirmation(null);
    setSelected(initial);
    setPurchaserName("");
    setPurchaserEmail("");
    setRecipientName("");
    setRecipientEmail("");
    setMessage("");
    setError("");
    setSubmitting(false);
  };

  // ── Confirmation screen ───────────────────────────────────────────────
  if (confirmation) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-6">🎁</div>
        <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-3">
          Gift card sent!
        </h1>
        <p className="text-[#7a6f68] font-light mb-8 leading-relaxed">
          A <strong className="text-[#1a1a1a]">${confirmation.denomination_cents / 100}</strong> gift card has been sent
          to <strong className="text-[#1a1a1a]">{confirmation.recipient_name}</strong> at{" "}
          <strong className="text-[#1a1a1a]">{confirmation.recipient_email}</strong>.
        </p>

        {/* Code display */}
        <div className="bg-white border border-[#e8e0d8] rounded-2xl px-8 py-8 mb-8 inline-block w-full max-w-sm mx-auto">
          <p className="text-xs uppercase tracking-wider text-[#b0a499] mb-3">Gift Card Code</p>
          <p className="font-mono text-2xl font-bold text-[#044e77] tracking-[0.25em] break-all">
            {confirmation.code}
          </p>
          <p className="text-xs text-[#9a8f87] mt-3 font-light">
            Keep this code as your purchase record.
          </p>
        </div>

        <button
          onClick={reset}
          className="text-sm text-[#044e77] border border-[#044e77] px-6 py-3 rounded-xl hover:bg-[#044e77] hover:text-white transition-colors font-light"
        >
          Purchase another gift card
        </button>
      </div>
    );
  }

  // ── Purchase form ─────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Heading */}
      <div className="text-center mb-10">
        <div className="text-4xl mb-4">🎁</div>
        <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-3">
          Gift Cards
        </h1>
        <p className="text-[#7a6f68] font-light max-w-md mx-auto leading-relaxed">
          Give the gift of beautiful skin — redeemable for any Cocoon treatment,
          valid forever, and accepted at checkout.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* LEFT: Denomination selector */}
          <div>
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6 mb-6">
              <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-5">
                Select Amount
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {DENOMINATIONS.map((d) => (
                  <button
                    key={d.cents}
                    type="button"
                    onClick={() => setSelected(d)}
                    className={[
                      "rounded-xl border-2 py-5 flex flex-col items-center justify-center gap-1 transition-all",
                      selected?.cents === d.cents
                        ? "border-[#044e77] bg-[#044e77] text-white shadow-md"
                        : "border-[#e8e0d8] text-[#3a3330] hover:border-[#fbb040] hover:shadow-sm",
                    ].join(" ")}
                  >
                    <span className={[
                      "font-[family-name:var(--font-cormorant)] text-3xl font-medium",
                      selected?.cents === d.cents ? "text-[#fbb040]" : "text-[#044e77]",
                    ].join(" ")}>
                      {d.label}
                    </span>
                    <span className={[
                      "text-xs font-light",
                      selected?.cents === d.cents ? "text-white/70" : "text-[#9a8f87]",
                    ].join(" ")}>
                      gift card
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* What to expect */}
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6">
              <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
                How it works
              </h2>
              <ul className="space-y-3">
                {[
                  ["🎁", "The recipient gets an email with their unique gift card code instantly."],
                  ["✨", "Redeemable for any Cocoon treatment — facials, brows, LED therapy, make-up."],
                  ["💳", "Used at checkout — applied automatically to reduce the booking total."],
                  ["♾️", "Never expires and can be used across multiple bookings."],
                ].map(([icon, text]) => (
                  <li key={text} className="flex items-start gap-3 text-sm text-[#7a6f68] font-light leading-relaxed">
                    <span className="text-base shrink-0 mt-0.5">{icon}</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* RIGHT: Details + payment */}
          <div className="space-y-5">
            {/* Purchaser details */}
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6">
              <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
                Your Details
              </h2>
              <div className="space-y-4">
                <Field
                  label="Your name"
                  type="text"
                  value={purchaserName}
                  onChange={setPurchaserName}
                  placeholder="Jane Smith"
                  required
                />
                <Field
                  label="Your email"
                  type="email"
                  value={purchaserEmail}
                  onChange={setPurchaserEmail}
                  placeholder="jane@example.com"
                  required
                  hint="For your purchase confirmation — the gift card code is not sent here."
                />
              </div>
            </div>

            {/* Recipient details */}
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6">
              <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
                Recipient Details
              </h2>
              <div className="space-y-4">
                <Field
                  label="Recipient's name"
                  type="text"
                  value={recipientName}
                  onChange={setRecipientName}
                  placeholder="Sarah Jones"
                  required
                />
                <Field
                  label="Recipient's email"
                  type="email"
                  value={recipientEmail}
                  onChange={setRecipientEmail}
                  placeholder="sarah@example.com"
                  required
                  hint="The gift card code will be emailed here."
                />
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-[#7a6f68] font-light">Personal message (optional)</label>
                    <span className="text-xs text-[#b0a499]">{message.length}/200</span>
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                    placeholder="Add a personal note to include in the gift card email…"
                    rows={3}
                    className="w-full border border-[#e8e0d8] rounded-xl px-4 py-3 text-sm font-light
                               text-[#1a1a1a] placeholder:text-[#c8bfb8] resize-none
                               focus:outline-none focus:border-[#044e77] transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Order summary */}
            {selected && (
              <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6">
                <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
                  Order Summary
                </h2>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#7a6f68] font-light">
                    {selected.label} Cocoon Gift Card
                  </span>
                  <span className="font-[family-name:var(--font-cormorant)] text-2xl font-medium text-[#044e77]">
                    {selected.label}
                  </span>
                </div>
              </div>
            )}

            {/* Card payment */}
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6">
              <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
                Card Details
              </h2>

              {!sdkReady && (
                <div className="flex items-center gap-2 text-sm text-[#9a8f87] font-light py-4">
                  <div className="w-4 h-4 border-2 border-[#e8e0d8] border-t-[#044e77] rounded-full animate-spin" />
                  Loading secure payment form...
                </div>
              )}

              <div
                id="gc-card-container"
                className={!cardReady ? "hidden" : ""}
                style={{ minHeight: "89px" }}
              />
              <style>{`
                #gc-card-container .sq-card-postal-code,
                #gc-card-container .postal-code-wrapper,
                #gc-card-container [data-field-type="postalCode"] { display: none !important; }
              `}</style>

              <p className="text-xs text-[#b0a499] font-light mt-3 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Secured by Square · Card details never stored by Cocoon
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-light">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!cardReady || submitting || !selected}
              className={[
                "w-full rounded-xl py-4 px-6 font-medium text-white transition-all text-base",
                cardReady && !submitting && selected
                  ? "bg-[#044e77] hover:bg-[#033d5c] active:bg-[#022d44]"
                  : "bg-[#b0c4d4] cursor-not-allowed",
              ].join(" ")}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Processing payment...
                </span>
              ) : selected ? (
                `Purchase ${selected.label} Gift Card`
              ) : (
                "Select an amount to continue"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, type, value, onChange, placeholder, required, hint,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[#7a6f68] font-light mb-1">
        {label}{required && " *"}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full border border-[#e8e0d8] rounded-xl px-4 py-3 text-sm font-light
                   text-[#1a1a1a] placeholder:text-[#c8bfb8]
                   focus:outline-none focus:border-[#044e77] transition-colors"
      />
      {hint && <p className="text-xs text-[#b0a499] mt-1 font-light">{hint}</p>}
    </div>
  );
}
