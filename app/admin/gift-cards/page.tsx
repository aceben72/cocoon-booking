"use client";

import { useState, useEffect, useCallback } from "react";

interface GiftCard {
  id: string;
  code: string;
  initial_value_cents: number;
  remaining_value_cents: number;
  purchaser_name: string | null;
  purchaser_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  note: string | null;
  personal_message: string | null;
  source: "admin" | "customer";
  is_active: boolean;
  created_at: string;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default function GiftCardsPage() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Form fields
  const [value, setValue] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [lastCreated, setLastCreated] = useState<GiftCard | null>(null);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gift-cards");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setCards(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gift cards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(value) * 100);
    if (!cents || cents <= 0) {
      setCreateError("Please enter a valid dollar amount.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/gift-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initial_value_cents: cents,
          purchaser_email: purchaserEmail || null,
          recipient_name: recipientName || null,
          recipient_email: recipientEmail || null,
          note: note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setLastCreated(data);
      setValue("");
      setPurchaserEmail("");
      setRecipientName("");
      setRecipientEmail("");
      setNote("");
      setShowForm(false);
      await fetchCards();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create gift card");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (card: GiftCard) => {
    const res = await fetch("/api/gift-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: card.id, is_active: !card.is_active }),
    });
    if (res.ok) {
      setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, is_active: !c.is_active } : c));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl">
          Gift Cards
        </h1>
        <button
          onClick={() => { setShowForm(true); setLastCreated(null); setCreateError(""); }}
          className="bg-[#044e77] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#033d5c] transition-colors"
        >
          + Create Gift Card
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-[#e8e0d8] rounded-xl p-6 mb-6">
          <h2 className="text-base font-medium text-[#1a1a1a] mb-4">New Gift Card</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Value ($) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="50"
                  required
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Purchaser Email</label>
                <input
                  type="email"
                  value={purchaserEmail}
                  onChange={(e) => setPurchaserEmail(e.target.value)}
                  placeholder="buyer@example.com"
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Recipient Name</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Recipient Email</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#7a6f68] mb-1">Personal Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Happy birthday! Enjoy your treatment."
                rows={2}
                className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77] resize-none"
              />
            </div>
            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="bg-[#044e77] text-white text-sm px-5 py-2 rounded-lg hover:bg-[#033d5c] disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating…" : "Create Gift Card"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm text-[#7a6f68] px-4 py-2 rounded-lg border border-[#ddd8d2] hover:bg-[#f5f1ed] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Last created card highlight */}
      {lastCreated && !showForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-emerald-800 font-medium mb-1">Gift card created successfully</p>
          <p className="text-lg font-mono font-semibold text-emerald-900 tracking-wider">
            {lastCreated.code}
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            Value: {formatPrice(lastCreated.initial_value_cents)}
            {lastCreated.recipient_name && ` · For: ${lastCreated.recipient_name}`}
          </p>
          <button
            onClick={() => setLastCreated(null)}
            className="text-xs text-emerald-600 mt-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[#9a8f87]">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="text-sm text-[#9a8f87]">No gift cards yet.</div>
      ) : (
        <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f5f2] border-b border-[#e8e0d8]">
              <tr>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Code</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Value</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Remaining</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden md:table-cell">Recipient</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden lg:table-cell">Created</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebe4]">
              {cards.map((card) => (
                <tr key={card.id} className={`hover:bg-[#faf8f6] ${!card.is_active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs tracking-wider text-[#1a1a1a]">
                    {card.code}
                  </td>
                  <td className="px-4 py-3 text-[#1a1a1a]">
                    {formatPrice(card.initial_value_cents)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={card.remaining_value_cents === 0 ? "text-[#9a8f87]" : "text-emerald-700 font-medium"}>
                      {formatPrice(card.remaining_value_cents)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#7a6f68] hidden md:table-cell">
                    {card.recipient_name ?? card.recipient_email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[#9a8f87] hidden lg:table-cell">
                    {formatDate(card.created_at)}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={[
                      "px-2 py-0.5 rounded-full text-xs",
                      card.source === "customer"
                        ? "bg-[#044e77]/10 text-[#044e77]"
                        : "bg-[#f0ebe4] text-[#7a6f68]",
                    ].join(" ")}>
                      {card.source === "customer" ? "Sold" : "Issued"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={[
                      "px-2 py-0.5 rounded-full text-xs",
                      card.is_active && card.remaining_value_cents > 0
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-[#f0ebe4] text-[#9a8f87]",
                    ].join(" ")}>
                      {!card.is_active ? "Deactivated" : card.remaining_value_cents === 0 ? "Used" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(card)}
                      className="text-xs text-[#7a6f68] hover:text-[#044e77] transition-colors"
                    >
                      {card.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
