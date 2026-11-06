"use client";

import { useEffect, useState } from "react";

export interface PickedGiftCard {
  id: string;
  code: string;
  initial_value_cents: number;
  remaining_value_cents: number;
  purchaser_name: string | null;
  purchaser_email: string | null;
  recipient_name: string | null;
  created_at: string;
  problem: string | null;
}

function money(cents: number) {
  const d = cents / 100;
  return d % 1 === 0 ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

/**
 * Choose a gift card: the client's own usable cards (matched by recipient
 * email or name) as one-tap options, or type a code (any case, spaces
 * ignored). Shows the code, balance left and who bought it. Read-only — the
 * redemption happens on save, under a lock, and re-checks everything.
 */
export function GiftCardPicker({
  lookup,
  picked,
  onPick,
}: {
  /** Query for the client's cards: appointmentId=… or email=…&firstName=…&lastName=… */
  lookup: string | null;
  picked: PickedGiftCard | null;
  onPick: (card: PickedGiftCard | null) => void;
}) {
  const [clientCards, setClientCards] = useState<PickedGiftCard[]>([]);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClientCards([]);
    if (!lookup) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/gift-cards?${lookup}`);
        const d = await res.json() as { cards?: PickedGiftCard[] };
        setClientCards(d.cards ?? []);
      } catch { /* suggestions only */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [lookup]);

  async function check() {
    setError(null);
    if (!code.trim()) { setError("Enter a gift card code"); return; }
    setChecking(true);
    try {
      const res = await fetch(`/api/admin/gift-cards?code=${encodeURIComponent(code)}`);
      const d = await res.json() as { card?: PickedGiftCard; error?: string };
      if (!res.ok || !d.card) { setError(d.error ?? "Gift card not found"); onPick(null); return; }
      if (d.card.problem) { setError(`${d.card.code}: ${d.card.problem}`); onPick(null); return; }
      onPick(d.card);
    } catch {
      setError("Couldn't check that code — try again");
    } finally {
      setChecking(false);
    }
  }

  if (picked) {
    return (
      <div className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
        <div className="text-sm">
          <div className="font-mono tracking-wider text-[#1a1a1a]">{picked.code}</div>
          <div className="text-xs text-[#5a504a]">
            {money(picked.remaining_value_cents)} left of {money(picked.initial_value_cents)}
            {picked.purchaser_name && ` · bought by ${picked.purchaser_name}`}
            {` · ${shortDate(picked.created_at)}`}
          </div>
        </div>
        <button type="button" onClick={() => onPick(null)} className="text-xs text-[#7a6f68] underline shrink-0">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {clientCards.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-[#7a6f68]">This client&rsquo;s gift cards:</p>
          {clientCards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setError(null); onPick(c); }}
              className="w-full text-left border border-[#ddd8d2] hover:border-[#044e77] rounded-lg px-3 py-2 text-sm"
            >
              <span className="font-mono tracking-wider">{c.code}</span>
              <span className="text-xs text-[#5a504a]">
                {" "}· {money(c.remaining_value_cents)} left
                {c.purchaser_name && ` · bought by ${c.purchaser_name}`}
                {` · ${shortDate(c.created_at)}`}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); check(); } }}
          placeholder="GIFT-XXXX-XXXX"
          autoComplete="off"
          className="flex-1 h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:border-[#044e77]"
        />
        <button
          type="button"
          onClick={check}
          disabled={checking}
          className="h-10 px-3 rounded-lg border border-[#044e77] text-[#044e77] text-sm disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
