"use client";

import { useState, useEffect, useRef } from "react";

const PACKAGES = [
  {
    type: "indulge" as const,
    name: "Indulge Facial Package",
    service: "Indulge Facial",
    price: "$499",
    priceCents: 49900,
    description:
      "A deeply nourishing facial experience tailored to your skin. This package includes 4 Indulge Facial appointments to be used within 180 days.",
    highlight: "Best for hydration & radiance",
  },
  {
    type: "opulence" as const,
    name: "Opulence Facial Package",
    service: "Opulence Facial",
    price: "$635",
    priceCents: 63500,
    description:
      "Our most indulgent facial — a complete skin transformation with advanced techniques. This package includes 4 Opulence Facial appointments to be used within 180 days.",
    highlight: "Best for anti-ageing & renewal",
  },
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
  package_type: "indulge" | "opulence";
  recipient_name: string;
  recipient_email: string;
  expires_at: string;
}

export default function FacialPackagePurchase() {
  const [selected, setSelected] = useState<typeof PACKAGES[0] | null>(null);

  const [purchaserName, setPurchaserName] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [forMe, setForMe] = useState(false);

  const [sdkReady, setSdkReady] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const cardRef = useRef<SquareCard | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);

  // Copy purchaser → recipient when "for me" is checked
  useEffect(() => {
    if (forMe) {
      setRecipientName(purchaserName);
      setRecipientEmail(purchaserEmail);
    }
  }, [forMe, purchaserName, purchaserEmail]);

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
        await card.attach("#fp-card-container");
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
    if (!selected) { setError("Please select a package."); return; }
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

      const res = await fetch("/api/facial-packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_type: selected.type,
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
    setSelected(null);
    setPurchaserName("");
    setPurchaserEmail("");
    setRecipientName("");
    setRecipientEmail("");
    setMessage("");
    setForMe(false);
    setError("");
    setSubmitting(false);
  };

  // ── Confirmation screen ───────────────────────────────────────────────
  if (confirmation) {
    const pkg = PACKAGES.find((p) => p.type === confirmation.package_type)!;
    const expiryDisplay = new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(confirmation.expires_at));

    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-6">✨</div>
        <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-3">
          Package purchased!
        </h1>
        <p className="text-[#7a6f68] font-light mb-8 leading-relaxed">
          A <strong className="text-[#1a1a1a]">{pkg.name}</strong> has been sent to{" "}
          <strong className="text-[#1a1a1a]">{confirmation.recipient_name}</strong> at{" "}
          <strong className="text-[#1a1a1a]">{confirmation.recipient_email}</strong>.
        </p>

        <div className="bg-white border border-[#e8e0d8] rounded-2xl px-8 py-8 mb-8 inline-block w-full max-w-sm mx-auto">
          <p className="text-xs uppercase tracking-wider text-[#b0a499] mb-3">Package Code</p>
          <p className="font-mono text-2xl font-bold text-[#044e77] tracking-[0.2em] break-all mb-4">
            {confirmation.code}
          </p>
          <div className="grid grid-cols-3 gap-3 text-xs border-t border-[#f0ebe4] pt-4">
            <div>
              <p className="text-[#b0a499] uppercase tracking-wider mb-1">Service</p>
              <p className="text-[#1a1a1a] font-medium">{pkg.service}</p>
            </div>
            <div>
              <p className="text-[#b0a499] uppercase tracking-wider mb-1">Uses</p>
              <p className="text-[#1a1a1a] font-medium">4 total</p>
            </div>
            <div>
              <p className="text-[#b0a499] uppercase tracking-wider mb-1">Expires</p>
              <p className="text-[#1a1a1a] font-medium">{expiryDisplay}</p>
            </div>
          </div>
        </div>

        <button
          onClick={reset}
          className="text-sm text-[#044e77] border border-[#044e77] px-6 py-3 rounded-xl hover:bg-[#044e77] hover:text-white transition-colors font-light"
        >
          Purchase another package
        </button>
      </div>
    );
  }

  // ── Purchase form ─────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Heading */}
      <div className="text-center mb-10">
        <div className="text-4xl mb-4">✨</div>
        <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-3">
          Facial Packages
        </h1>
        <p className="text-[#7a6f68] font-light max-w-md mx-auto leading-relaxed">
          Purchase a package of four facial appointments and save — redeemable over
          180 days, applied at booking with your unique package code.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* LEFT: Package selector + how it works */}
          <div>
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6 mb-6">
              <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-5">
                Select Package
              </h2>
              <div className="space-y-3">
                {PACKAGES.map((pkg) => (
                  <button
                    key={pkg.type}
                    type="button"
                    onClick={() => setSelected(pkg)}
                    className={[
                      "w-full text-left rounded-xl border-2 p-5 transition-all",
                      selected?.type === pkg.type
                        ? "border-[#044e77] bg-[#044e77]/5"
                        : "border-[#e8e0d8] hover:border-[#fbb040] hover:shadow-sm",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={[
                            "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center",
                            selected?.type === pkg.type ? "border-[#044e77]" : "border-[#c8bfb8]",
                          ].join(" ")}
                        >
                          {selected?.type === pkg.type && (
                            <div className="w-2 h-2 rounded-full bg-[#044e77]" />
                          )}
                        </div>
                        <div>
                          <p className={`font-[family-name:var(--font-cormorant)] text-xl font-medium italic ${selected?.type === pkg.type ? "text-[#044e77]" : "text-[#3a3330]"}`}>
                            {pkg.name}
                          </p>
                          <p className="text-xs text-[#fbb040] font-medium mt-0.5">{pkg.highlight}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-[family-name:var(--font-cormorant)] text-2xl font-medium ${selected?.type === pkg.type ? "text-[#044e77]" : "text-[#3a3330]"}`}>
                          {pkg.price}
                        </p>
                        <p className="text-xs text-[#9a8f87] font-light">4 appointments</p>
                      </div>
                    </div>
                    <p className="text-xs text-[#7a6f68] font-light leading-relaxed ml-7">
                      {pkg.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6">
              <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-4">
                How it works
              </h2>
              <ul className="space-y-3">
                {[
                  ["✨", "Purchase a package and receive a unique code by email instantly."],
                  ["📅", "Book your facial online and enter your code at the payment step."],
                  ["💳", "The package covers the full appointment cost — no payment at booking."],
                  ["🗓️", "Use all 4 appointments within 180 days of purchase."],
                  ["🔒", "Each code is locked to one specific facial type."],
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
                  hint="Your purchase confirmation will be sent here."
                />
              </div>
            </div>

            {/* Recipient details */}
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light">
                  Recipient Details
                </h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={forMe}
                      onChange={(e) => setForMe(e.target.checked)}
                    />
                    <div className="w-8 h-5 rounded-full bg-[#ddd8d2] peer-checked:bg-[#044e77] transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-3" />
                  </div>
                  <span className="text-xs text-[#7a6f68] font-light">This is for me</span>
                </label>
              </div>
              <div className="space-y-4">
                <Field
                  label="Recipient's name"
                  type="text"
                  value={recipientName}
                  onChange={(v) => { if (!forMe) setRecipientName(v); }}
                  placeholder="Sarah Jones"
                  required
                  disabled={forMe}
                />
                <Field
                  label="Recipient's email"
                  type="email"
                  value={recipientEmail}
                  onChange={(v) => { if (!forMe) setRecipientEmail(v); }}
                  placeholder="sarah@example.com"
                  required
                  disabled={forMe}
                  hint="The package code and redemption instructions will be emailed here."
                />
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-[#7a6f68] font-light">Personal message (optional)</label>
                    <span className="text-xs text-[#b0a499]">{message.length}/200</span>
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                    placeholder="Add a personal note to include in the email…"
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
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-[#7a6f68] font-light">{selected.name}</p>
                    <p className="text-xs text-[#b0a499] font-light mt-0.5">
                      4 × {selected.service} · valid 180 days
                    </p>
                  </div>
                  <span className="font-[family-name:var(--font-cormorant)] text-2xl font-medium text-[#044e77] shrink-0 ml-4">
                    {selected.price}
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
                id="fp-card-container"
                className={!cardReady ? "hidden" : ""}
                style={{ minHeight: "89px" }}
              />
              <style>{`
                #fp-card-container .sq-card-postal-code,
                #fp-card-container .postal-code-wrapper,
                #fp-card-container [data-field-type="postalCode"] { display: none !important; }
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
                `Purchase ${selected.name} — ${selected.price}`
              ) : (
                "Select a package to continue"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, type, value, onChange, placeholder, required, hint, disabled,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
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
        disabled={disabled}
        className={[
          "w-full border border-[#e8e0d8] rounded-xl px-4 py-3 text-sm font-light",
          "text-[#1a1a1a] placeholder:text-[#c8bfb8]",
          "focus:outline-none focus:border-[#044e77] transition-colors",
          disabled ? "bg-[#f8f5f2] text-[#9a8f87] cursor-not-allowed" : "bg-white",
        ].join(" ")}
      />
      {hint && <p className="text-xs text-[#b0a499] mt-1 font-light">{hint}</p>}
    </div>
  );
}
