"use client";

import { useState, useEffect } from "react";
import { SERVICES, CATEGORY_META } from "@/lib/services-data";

const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 8; h <= 19; h++) {
  for (const m of [0, 30]) {
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const period = h < 12 ? "am" : "pm";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    TIME_OPTIONS.push({ value: `${hh}:${mm}`, label: `${h12}:${mm}${period}` });
  }
}

const activeServices = SERVICES.filter((s) => s.active);

function todayAEST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
  initialDate?: string;
}

export function NewBookingForm({ onClose, onCreated, initialDate }: Props) {
  const [serviceId, setServiceId]   = useState(activeServices[0]?.id ?? "");
  const [date, setDate]             = useState(initialDate ?? todayAEST());
  const [time, setTime]             = useState("10:00");
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [email, setEmail]           = useState("");
  const [mobile, setMobile]         = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<{ name: string; paymentUrl: string } | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [conflictChecking, setConflictChecking] = useState(false);

  const selectedService = activeServices.find((s) => s.id === serviceId);

  // ── Conflict check ──────────────────────────────────────────────────────
  // Fires 400 ms after date/time/service changes to avoid hammering the API.
  useEffect(() => {
    setConflictWarning(null);
    if (!date || !time || !selectedService) return;

    const timer = setTimeout(async () => {
      setConflictChecking(true);
      try {
        // Build start ISO in AEST (UTC+10)
        const startISO = new Date(`${date}T${time}:00+10:00`).toISOString();
        // End = duration + 30 min buffer
        const endMs   = new Date(startISO).getTime() + (selectedService.duration_minutes + 30) * 60_000;
        const endISO  = new Date(endMs).toISOString();

        const res = await fetch(
          `/api/admin/conflict-check?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
        );
        if (!res.ok) return;

        const data = await res.json() as {
          conflict: boolean;
          appointmentCount: number;
          blockedPeriodCount: number;
        };

        if (!data.conflict) return;

        const parts: string[] = [];
        if (data.appointmentCount > 0) {
          parts.push(data.appointmentCount === 1 ? "1 existing appointment" : `${data.appointmentCount} existing appointments`);
        }
        if (data.blockedPeriodCount > 0) {
          parts.push(data.blockedPeriodCount === 1 ? "1 blocked period" : `${data.blockedPeriodCount} blocked periods`);
        }
        setConflictWarning(`This slot overlaps with ${parts.join(" and ")}. You can still proceed if intended.`);
      } catch {
        // Silently ignore — conflict check is advisory only
      } finally {
        setConflictChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [date, time, serviceId, selectedService]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, date, time, firstName, lastName, email, mobile }),
      });
      const data = await res.json() as { error?: string; paymentUrl?: string; service?: string };

      if (!res.ok) {
        setError(data.error ?? "Failed to create booking");
        return;
      }

      setSuccess({ name: `${firstName} ${lastName}`, paymentUrl: data.paymentUrl ?? "" });
      onCreated();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <span className="text-emerald-500 text-xl mt-0.5">✓</span>
          <div className="flex-1">
            <p className="font-medium text-emerald-800 mb-1">Booking created for {success.name}</p>
            <p className="text-sm text-emerald-700 mb-3">
              A payment request has been sent via email and SMS. The link expires in 48 hours.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={success.paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono bg-white border border-emerald-200 rounded px-2 py-1 text-emerald-800 break-all"
              >
                {success.paymentUrl}
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(success.paymentUrl)}
                className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap"
              >
                Copy link
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => { setSuccess(null); setFirstName(""); setLastName(""); setEmail(""); setMobile(""); }}
            className="text-sm px-4 py-2 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            Create another
          </button>
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-[#e8e0d8] rounded-xl p-6 mb-6"
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-xl">
          New Booking
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[#9a8f87] hover:text-[#1a1a1a] transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Service */}
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Service</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            required
            className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          >
            {CATEGORY_META.map((cat) => {
              const catServices = activeServices.filter((s) => s.category === cat.id);
              if (!catServices.length) return null;
              return (
                <optgroup key={cat.id} label={cat.label}>
                  {catServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ${(s.price_cents / 100).toFixed(0)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {selectedService && (
            <p className="text-xs text-[#9a8f87] mt-1">
              {selectedService.duration_minutes} min · ${(selectedService.price_cents / 100).toFixed(0)}
            </p>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          />
        </div>

        {/* Time */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Time (AEST)</label>
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          >
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {conflictChecking && (
            <p className="text-xs text-[#9a8f87] mt-1 animate-pulse">Checking availability…</p>
          )}
        </div>

        {/* First name */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">First Name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            placeholder="Jane"
            className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                       placeholder:text-[#c0b4ab]"
          />
        </div>

        {/* Last name */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            placeholder="Smith"
            className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                       placeholder:text-[#c0b4ab]"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="jane@example.com"
            className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                       placeholder:text-[#c0b4ab]"
          />
        </div>

        {/* Mobile */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Mobile</label>
          <input
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            required
            placeholder="04XX XXX XXX"
            className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                       placeholder:text-[#c0b4ab]"
          />
        </div>
      </div>

      {conflictWarning && (
        <div className="mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-amber-800">{conflictWarning}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-[#044e77] text-white text-sm font-medium
                     hover:bg-[#033d5c] disabled:opacity-50 transition-colors"
        >
          {saving ? "Creating…" : "Create booking & send payment link"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-lg border border-[#ddd8d2] text-sm text-[#5a504a]
                     hover:border-[#c0b4ab] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
