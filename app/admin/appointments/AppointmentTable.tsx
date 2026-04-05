"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { NewBookingForm } from "./NewBookingForm";

// ── Types ────────────────────────────────────────────────────────────────────

interface BlockedPeriod {
  id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
}

interface ClassBooking {
  id: string;
  status: string;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    mobile: string;
  } | null;
}

interface ClassSession {
  id: string;
  class_type: string;
  title: string;
  start_datetime: string;
  duration_minutes: number;
  capacity: number;
  description: string | null;
  active: boolean;
  class_bookings: ClassBooking[];
}

// ── Edit form time options (6 am – 8 pm, 30-min steps) ─────────────────────
const EDIT_TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 6; h <= 20; h++) {
  for (const m of [0, 30]) {
    if (h === 20 && m === 30) continue;
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const period = h < 12 ? "am" : "pm";
    EDIT_TIME_OPTIONS.push({ value: `${hh}:${mm}`, label: `${h12}:${mm}${period}` });
  }
}

interface Appointment {
  id: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
  amount_cents: number;
  amount_paid_cents: number;
  square_payment_id: string | null;
  payment_link_token: string | null;
  notes: string | null;
  created_at: string;
  services: { name: string; category: string; duration_minutes: number } | null;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    mobile: string;
    is_new_client: boolean;
  } | null;
  intake_forms: { id: string; status: string }[];
}

const STATUS_COLOURS: Record<string, string> = {
  confirmed:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending:         "bg-amber-50   text-amber-700   border-amber-200",
  pending_payment: "bg-purple-50  text-purple-700  border-purple-200",
  completed:       "bg-blue-50    text-blue-700    border-blue-200",
  cancelled:       "bg-red-50     text-red-600     border-red-200",
};

function PaymentLinkRow({ appointmentId, token }: { appointmentId: string; token: string }) {
  const [copied,   setCopied]   = useState(false);
  const [resending, setResending] = useState(false);
  const [resent,   setResent]   = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const paymentUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/pay/${token}`;

  function handleCopy() {
    navigator.clipboard.writeText(paymentUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleResend() {
    setResendError(null);
    setResending(true);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}/resend-payment`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setResendError(d.error ?? "Failed to resend");
      } else {
        setResent(true);
        setTimeout(() => setResent(false), 3000);
      }
    } catch {
      setResendError("An error occurred");
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Payment Link</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-[#5a504a] bg-[#f8f5f2] border border-[#e8e0d8]
                         rounded px-2 py-1 break-all">
          {paymentUrl}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs px-2.5 py-1 rounded border border-[#ddd8d2] text-[#5a504a]
                     hover:border-[#044e77] hover:text-[#044e77] transition-colors whitespace-nowrap"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onClick={handleResend}
          disabled={resending}
          className="text-xs px-2.5 py-1 rounded border border-purple-200 text-purple-700
                     hover:bg-purple-50 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {resending ? "Sending…" : resent ? "✓ Sent!" : "Resend payment request"}
        </button>
      </div>
      {resendError && (
        <p className="text-xs text-red-600 mt-1">{resendError}</p>
      )}
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        suppressHydrationWarning
        className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                   focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                   cursor-pointer"
      />
    </div>
  );
}

function formatAEST(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isoToAESTFields(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(d);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const rawH = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
  const rawM = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
  const h = rawH === 24 ? 0 : rawH;
  // Snap to nearest 30 min option
  const snappedM = rawM < 15 ? "00" : rawM < 45 ? "30" : "00";
  const snappedH = rawM >= 45 ? h + 1 : h;
  return { date, time: `${String(snappedH).padStart(2, "0")}:${snappedM}` };
}

/** Snap ISO timestamp to nearest 30-min AEST time value for a <select>. */
function isoToAESTTime(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const rawH = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
  const rawM = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
  const h = rawH === 24 ? 0 : rawH;
  const snappedM = rawM < 15 ? "00" : rawM < 45 ? "30" : "00";
  const snappedH = rawM >= 45 ? h + 1 : h;
  return `${String(snappedH).padStart(2, "0")}:${snappedM}`;
}

/** Exact AEST time for display only (e.g. "9:00 am"). */
function formatAESTTimeOnly(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// ── Inline blocked period edit form ──────────────────────────────────────────

function EditBlockForm({
  bp,
  onCancel,
  onSaved,
}: {
  bp: BlockedPeriod;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const startDate = isoToAESTFields(bp.start_datetime);
  const [date,   setDate]   = useState(startDate.date);
  const [start,  setStart]  = useState(startDate.time);
  const [end,    setEnd]    = useState(isoToAESTTime(bp.end_datetime));
  const [reason, setReason] = useState(bp.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [saved,  setSaved]  = useState(false);
  const [conflictWarning,  setConflictWarning]  = useState<string | null>(null);
  const [conflictChecking, setConflictChecking] = useState(false);

  useEffect(() => {
    setConflictWarning(null);
    if (!date || !start || !end) return;
    const startISO = new Date(`${date}T${start}:00+10:00`).toISOString();
    const endISO   = new Date(`${date}T${end}:00+10:00`).toISOString();
    if (new Date(startISO) >= new Date(endISO)) return;
    const timer = setTimeout(async () => {
      setConflictChecking(true);
      try {
        const res = await fetch(
          `/api/admin/conflict-check?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&excludeId=${bp.id}`,
        );
        if (!res.ok) return;
        const data = await res.json() as { conflict: boolean; appointmentCount: number; blockedPeriodCount: number };
        if (!data.conflict) return;
        const parts: string[] = [];
        if (data.appointmentCount  > 0) parts.push(`${data.appointmentCount} appointment${data.appointmentCount > 1 ? "s" : ""}`);
        if (data.blockedPeriodCount > 0) parts.push(`${data.blockedPeriodCount} blocked period${data.blockedPeriodCount > 1 ? "s" : ""}`);
        setConflictWarning(`Overlaps with ${parts.join(" and ")}. You can still save if intended.`);
      } catch { /* advisory */ } finally {
        setConflictChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [date, start, end, bp.id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const startISO = new Date(`${date}T${start}:00+10:00`).toISOString();
      const endISO   = new Date(`${date}T${end}:00+10:00`).toISOString();
      const res = await fetch(`/api/admin/blocked-periods/${bp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_datetime: startISO, end_datetime: endISO, reason: reason || null }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to update");
        return;
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved(); }, 1200);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pt-3 border-t border-[#f0ebe4] mt-1">
      <p className="text-xs uppercase tracking-wider text-[#7a6f68] mb-3">Edit Blocked Period</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[#7a6f68] mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          />
        </div>
        <div>
          <label className="block text-xs text-[#7a6f68] mb-1">
            Start{conflictChecking && <span className="text-[#c0b4ab] ml-1 animate-pulse">checking…</span>}
          </label>
          <select
            value={start}
            onChange={e => setStart(e.target.value)}
            className="h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          >
            {EDIT_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#7a6f68] mb-1">End</label>
          <select
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          >
            {EDIT_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-[#7a6f68] mb-1">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Optional"
            className="w-full h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                       placeholder:text-[#c0b4ab]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="h-9 px-4 rounded-lg bg-[#044e77] text-white text-xs font-medium
                       hover:bg-[#033d5c] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {saved ? "✓ Saved!" : saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            className="h-9 px-3 rounded-lg border border-[#ddd8d2] text-xs text-[#5a504a]
                       hover:border-[#c0b4ab] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      {conflictWarning && (
        <div className="mt-2.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-amber-800">{conflictWarning}</p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── New blocked period form ───────────────────────────────────────────────────

function BlockTimeForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const todayAEST = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());

  const [date,   setDate]   = useState(todayAEST);
  const [start,  setStart]  = useState("09:00");
  const [end,    setEnd]    = useState("10:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [conflictWarning,  setConflictWarning]  = useState<string | null>(null);
  const [conflictChecking, setConflictChecking] = useState(false);

  useEffect(() => {
    setConflictWarning(null);
    if (!date || !start || !end) return;
    const startISO = new Date(`${date}T${start}:00+10:00`).toISOString();
    const endISO   = new Date(`${date}T${end}:00+10:00`).toISOString();
    if (new Date(startISO) >= new Date(endISO)) return;
    const timer = setTimeout(async () => {
      setConflictChecking(true);
      try {
        const res = await fetch(
          `/api/admin/conflict-check?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
        );
        if (!res.ok) return;
        const data = await res.json() as { conflict: boolean; appointmentCount: number; blockedPeriodCount: number };
        if (!data.conflict) return;
        const parts: string[] = [];
        if (data.appointmentCount  > 0) parts.push(`${data.appointmentCount} appointment${data.appointmentCount > 1 ? "s" : ""}`);
        if (data.blockedPeriodCount > 0) parts.push(`${data.blockedPeriodCount} blocked period${data.blockedPeriodCount > 1 ? "s" : ""}`);
        setConflictWarning(`This period overlaps with ${parts.join(" and ")}. You can still proceed if intended.`);
      } catch { /* advisory */ } finally {
        setConflictChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [date, start, end]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const startISO = new Date(`${date}T${start}:00+10:00`).toISOString();
      const endISO   = new Date(`${date}T${end}:00+10:00`).toISOString();
      const res = await fetch("/api/admin/blocked-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_datetime: startISO, end_datetime: endISO, reason: reason || null }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to save");
        return;
      }
      onCreated();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-[#e8e0d8] rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-xl">
          Block Time
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

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">
            Start
            {conflictChecking && <span className="text-[#c0b4ab] ml-1 normal-case animate-pulse">checking…</span>}
          </label>
          <select
            value={start}
            onChange={e => setStart(e.target.value)}
            className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          >
            {EDIT_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">End</label>
          <select
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          >
            {EDIT_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">
            Reason <span className="text-[#b0a499] normal-case font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Lunch break, Personal"
            className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                       placeholder:text-[#c0b4ab]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-10 px-5 rounded-lg bg-[#044e77] text-white text-sm font-medium
                       hover:bg-[#033d5c] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {saving ? "Saving…" : "Block this time"}
          </button>
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-lg border border-[#ddd8d2] text-sm text-[#5a504a]
                       hover:border-[#c0b4ab] transition-colors"
          >
            Cancel
          </button>
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
    </div>
  );
}

// ── Inline appointment edit form ─────────────────────────────────────────────

function EditApptForm({
  appt,
  onCancel,
  onSaved,
}: {
  appt: Appointment;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initial = isoToAESTFields(appt.start_datetime);
  const [date,  setDate]  = useState(initial.date);
  const [time,  setTime]  = useState(initial.time);
  const [notes, setNotes] = useState(appt.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [saved,  setSaved]  = useState(false);
  const [conflictWarning,  setConflictWarning]  = useState<string | null>(null);
  const [conflictChecking, setConflictChecking] = useState(false);

  // Debounced conflict check (excludes self)
  useEffect(() => {
    setConflictWarning(null);
    if (!date || !time) return;
    const timer = setTimeout(async () => {
      setConflictChecking(true);
      try {
        const startISO = new Date(`${date}T${time}:00+10:00`).toISOString();
        const durationMs = (appt.services?.duration_minutes ?? 60) * 60_000;
        const endISO = new Date(new Date(startISO).getTime() + durationMs).toISOString();
        const res = await fetch(
          `/api/admin/conflict-check?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&excludeId=${appt.id}`,
        );
        if (!res.ok) return;
        const data = await res.json() as { conflict: boolean; appointmentCount: number; blockedPeriodCount: number };
        if (!data.conflict) return;
        const parts: string[] = [];
        if (data.appointmentCount  > 0) parts.push(`${data.appointmentCount} appointment${data.appointmentCount > 1 ? "s" : ""}`);
        if (data.blockedPeriodCount > 0) parts.push(`${data.blockedPeriodCount} blocked period${data.blockedPeriodCount > 1 ? "s" : ""}`);
        setConflictWarning(`Overlaps with ${parts.join(" and ")}. You can still save if intended.`);
      } catch { /* advisory */ } finally {
        setConflictChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [date, time, appt.id, appt.services?.duration_minutes]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${appt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time, notes }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to update");
        return;
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved(); }, 1200);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pt-3 border-t border-[#f0ebe4] mt-1">
      <p className="text-xs uppercase tracking-wider text-[#7a6f68] mb-3">Edit Appointment</p>
      <div className="flex flex-wrap gap-3 items-end">
        {/* Date */}
        <div>
          <label className="block text-xs text-[#7a6f68] mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          />
        </div>
        {/* Time */}
        <div>
          <label className="block text-xs text-[#7a6f68] mb-1">
            Time (AEST)
            {conflictChecking && <span className="text-[#c0b4ab] ml-1 animate-pulse">checking…</span>}
          </label>
          <select
            value={time}
            onChange={e => setTime(e.target.value)}
            className="h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
          >
            {EDIT_TIME_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {/* Notes */}
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-[#7a6f68] mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="w-full h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                       placeholder:text-[#c0b4ab]"
          />
        </div>
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="h-9 px-4 rounded-lg bg-[#044e77] text-white text-xs font-medium
                       hover:bg-[#033d5c] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {saved ? "✓ Saved!" : saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={onCancel}
            className="h-9 px-3 rounded-lg border border-[#ddd8d2] text-xs text-[#5a504a]
                       hover:border-[#c0b4ab] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      {conflictWarning && (
        <div className="mt-2.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-amber-800">{conflictWarning}</p>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

// ── Inline class session editor ───────────────────────────────────────────────

function InlineClassEditor({
  session,
  onCancel,
  onSaved,
  onCancelled,
}: {
  session: ClassSession;
  onCancel: () => void;
  onSaved: () => void;
  onCancelled: () => void;
}) {
  const initial = isoToAESTFields(session.start_datetime);
  const [date,        setDate]        = useState(initial.date);
  const [time,        setTime]        = useState(initial.time);
  const [capacity,    setCapacity]    = useState(String(session.capacity));
  const [description, setDescription] = useState(session.description ?? "");
  const [saving,      setSaving]      = useState(false);
  const [cancelling,  setCancelling]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [saved,       setSaved]       = useState(false);

  const confirmedBookings = session.class_bookings.filter(b => b.status === "confirmed");

  async function handleSave() {
    const cap = parseInt(capacity, 10);
    if (!cap || cap < 1) {
      setError("Capacity must be at least 1.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startISO = new Date(`${date}T${time}:00+10:00`).toISOString();
      const res = await fetch(`/api/admin/classes/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          start_datetime: startISO,
          capacity: cap,
          description: description || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to update");
        return;
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved(); }, 1200);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelSession() {
    if (!confirm(`Cancel "${session.title}" and notify all ${confirmedBookings.length} registered client(s)?`)) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/classes/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed to cancel session");
        return;
      }
      onCancelled();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="pt-3 border-t border-[#f0ebe4] mt-1 space-y-4">
      {/* Edit fields */}
      <div>
        <p className="text-xs uppercase tracking-wider text-[#7a6f68] mb-3">Edit Session</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-[#7a6f68] mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                         focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
            />
          </div>
          <div>
            <label className="block text-xs text-[#7a6f68] mb-1">Time (AEST)</label>
            <select
              value={time}
              onChange={e => setTime(e.target.value)}
              className="h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                         focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
            >
              {EDIT_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#7a6f68] mb-1">Capacity</label>
            <input
              type="number"
              min="1"
              step="1"
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
              className="h-9 w-20 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                         focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-[#7a6f68] mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full h-9 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                         focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                         placeholder:text-[#c0b4ab]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="h-9 px-4 rounded-lg bg-[#044e77] text-white text-xs font-medium
                         hover:bg-[#033d5c] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {saved ? "✓ Saved!" : saving ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={onCancel}
              className="h-9 px-3 rounded-lg border border-[#ddd8d2] text-xs text-[#5a504a]
                         hover:border-[#c0b4ab] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* Registered clients */}
      {session.class_bookings.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-[#7a6f68] mb-2">Registered Clients</p>
          <div className="space-y-1">
            {session.class_bookings.map(b => (
              <div key={b.id} className="flex items-center gap-3 text-sm text-[#1a1a1a]">
                <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                  b.status === "confirmed" ? "bg-emerald-500" : "bg-[#c0b4ab]"
                }`} />
                <span className="font-medium">
                  {b.clients?.first_name} {b.clients?.last_name}
                </span>
                <span className="text-[#9a8f87] text-xs">{b.clients?.email}</span>
                {b.clients?.mobile && (
                  <span className="text-[#9a8f87] text-xs">{b.clients.mobile}</span>
                )}
                <span className={`text-xs capitalize ml-auto ${
                  b.status === "confirmed" ? "text-emerald-700" : "text-[#9a8f87]"
                }`}>{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel session */}
      {session.active && (
        <div className="pt-2 border-t border-[#f0ebe4]">
          <button
            onClick={handleCancelSession}
            disabled={cancelling}
            className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600
                       hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel this session"}
          </button>
          {confirmedBookings.length > 0 && (
            <span className="text-xs text-[#9a8f87] ml-2">
              Will notify {confirmedBookings.length} registered client{confirmedBookings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function AppointmentTable({
  appointments,
  blockedPeriods,
  classSessions,
  currentStatus,
  currentFrom,
  currentTo,
}: {
  appointments: Appointment[];
  blockedPeriods: BlockedPeriod[];
  classSessions: ClassSession[];
  currentStatus: string;
  currentFrom: string;
  currentTo: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [updatingId,      setUpdatingId]      = useState<string | null>(null);
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [editingBlockId,  setEditingBlockId]  = useState<string | null>(null);
  const [editingClassId,  setEditingClassId]  = useState<string | null>(null);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [showNewBooking,  setShowNewBooking]  = useState(false);
  const [showBlockForm,   setShowBlockForm]   = useState(false);

  // Local filter state — updates immediately for instant UI feedback.
  // Props reflect server-rendered values and arrive after the round-trip;
  // we sync back to them once the navigation settles.
  const [localStatus, setLocalStatus] = useState(currentStatus);
  const [localFrom, setLocalFrom]     = useState(currentFrom);
  const [localTo, setLocalTo]         = useState(currentTo);

  useEffect(() => { setLocalStatus(currentStatus); }, [currentStatus]);
  useEffect(() => { setLocalFrom(currentFrom); },     [currentFrom]);
  useEffect(() => { setLocalTo(currentTo); },         [currentTo]);

  function applyFilter(overrides: Record<string, string>) {
    const next = { status: localStatus, from: localFrom, to: localTo, ...overrides };

    // Update local state immediately so the UI reflects the change at once
    setLocalStatus(next.status);
    setLocalFrom(next.from);
    setLocalTo(next.to);

    // Build URL — omit "all" status and empty dates
    const sp = new URLSearchParams();
    if (next.status && next.status !== "all") sp.set("status", next.status);
    if (next.from) sp.set("from", next.from);
    if (next.to)   sp.set("to",   next.to);

    startTransition(() => router.push(`/admin/appointments?${sp.toString()}`));
  }

  async function handleDeleteBlock(id: string) {
    if (!confirm("Delete this blocked period?")) return;
    setDeletingBlockId(id);
    try {
      await fetch(`/api/admin/blocked-periods/${id}`, { method: "DELETE" });
      startTransition(() => router.refresh());
    } catch { /* ignore */ } finally {
      setDeletingBlockId(null);
    }
  }

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setUpdatingId(null);
    if (res.ok) {
      startTransition(() => router.refresh());
    } else {
      alert("Failed to update status");
    }
  }

  // Today in AEST (client-side, for the Today button and highlighting)
  const todayAEST = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
  }).format(new Date());

  const isViewingToday = localFrom === todayAEST && localTo === todayAEST;
  const hasNonDateFilter = localStatus !== "all";

  return (
    <div className="space-y-4">
      {/* Inline forms (only one visible at a time) */}
      {showNewBooking && (
        <NewBookingForm
          onClose={() => setShowNewBooking(false)}
          onCreated={() => startTransition(() => router.refresh())}
        />
      )}
      {showBlockForm && (
        <BlockTimeForm
          onClose={() => setShowBlockForm(false)}
          onCreated={() => { setShowBlockForm(false); startTransition(() => router.refresh()); }}
        />
      )}

      {/* Action buttons — hidden while a form is open */}
      {!showNewBooking && !showBlockForm && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setShowBlockForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#ddd8d2] text-sm
                       font-medium text-[#5a504a] hover:border-[#044e77] hover:text-[#044e77] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            Block Time
          </button>
          <button
            onClick={() => setShowNewBooking(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#044e77] text-white text-sm
                       font-medium hover:bg-[#033d5c] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Booking
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#f0ebe4] p-4 flex flex-wrap gap-3 items-end">
        {/* Status */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Status</label>
          <select
            value={localStatus}
            onChange={(e) => applyFilter({ status: e.target.value })}
            suppressHydrationWarning
            className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                       focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                       cursor-pointer"
          >
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="pending_payment">Pending Payment</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-8 bg-[#f0ebe4] self-end mb-1" />

        {/* From */}
        <DateInput
          label="From"
          value={localFrom}
          onChange={(v) => {
            // If the new From date is after the current To date, advance To to match
            const override: Record<string, string> = { from: v };
            if (v && localTo && v > localTo) override.to = v;
            applyFilter(override);
          }}
        />

        {/* To */}
        <DateInput
          label="To"
          value={localTo}
          onChange={(v) => applyFilter({ to: v })}
        />

        {/* Today button — always visible */}
        <button
          onClick={() => applyFilter({ from: todayAEST, to: todayAEST, status: "all" })}
          className={[
            "h-10 px-4 rounded-lg border text-sm font-medium transition-colors",
            isViewingToday && !hasNonDateFilter
              ? "border-[#044e77] bg-[#044e77] text-white"
              : "border-[#ddd8d2] text-[#044e77] hover:border-[#044e77] hover:bg-[#044e77]/5",
          ].join(" ")}
        >
          Today
        </button>

        {/* Clear — shown when status is filtered or dates aren't today */}
        {(hasNonDateFilter || !isViewingToday) && (
          <button
            onClick={() => applyFilter({ from: todayAEST, to: todayAEST, status: "all" })}
            className="h-10 px-3 text-sm text-[#9a8f87] hover:text-[#1a1a1a] transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Merged table: appointments + blocked periods, sorted by start time ── */}
      {(() => {
        type Row =
          | { kind: "appointment"; data: Appointment }
          | { kind: "blocked";     data: BlockedPeriod }
          | { kind: "class";       data: ClassSession };

        const rows: Row[] = [
          ...appointments.map(a  => ({ kind: "appointment" as const, data: a })),
          ...blockedPeriods.map(b => ({ kind: "blocked"     as const, data: b })),
          ...classSessions.map(c  => ({ kind: "class"       as const, data: c })),
        ].sort((a, b) =>
          new Date(a.data.start_datetime).getTime() - new Date(b.data.start_datetime).getTime()
        );

        if (rows.length === 0) return (
          <div className="bg-white rounded-xl border border-[#f0ebe4] p-12 text-center text-[#7a6f68]">
            No appointments or blocked periods found.
          </div>
        );

        return (
        <div className="bg-white rounded-xl border border-[#f0ebe4] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f5f2] border-b border-[#f0ebe4]">
              <tr>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Client</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Service</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Status</th>
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Amount</th>
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebe4]">
              {rows.map(row => {
                if (row.kind === "blocked") {
                  const bp = row.data;
                  return (
                    <React.Fragment key={`block-${bp.id}`}>
                      {/* ── Blocked period row ─────────────────────────── */}
                      <tr className="bg-[#f5f1ed] hover:bg-[#f0ebe4]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base leading-none">🚫</span>
                            <span className="text-sm font-medium text-[#5a504a]">Blocked</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#7a6f68] italic text-sm">
                          {bp.reason || <span className="not-italic text-[#c0b4ab]">No reason given</span>}
                        </td>
                        <td className="px-4 py-3 text-[#1a1a1a] whitespace-nowrap">
                          <div>{formatAEST(bp.start_datetime)}</div>
                          <div className="text-xs text-[#9a8f87] mt-0.5">
                            until {formatAESTTimeOnly(bp.end_datetime)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium
                                           bg-[#ede8e2] text-[#7a6f68] border-[#ddd8d2]">
                            Blocked
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[#c0b4ab]">—</td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingBlockId(editingBlockId === bp.id ? null : bp.id)}
                              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                editingBlockId === bp.id
                                  ? "border-[#044e77] bg-[#044e77] text-white"
                                  : "border-[#ddd8d2] text-[#5a504a] hover:border-[#044e77] hover:text-[#044e77]"
                              }`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteBlock(bp.id)}
                              disabled={deletingBlockId === bp.id}
                              className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600
                                         hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              {deletingBlockId === bp.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingBlockId === bp.id && (
                        <tr className="bg-[#faf8f5]">
                          <td colSpan={6} className="px-4 pb-4">
                            <EditBlockForm
                              bp={bp}
                              onCancel={() => setEditingBlockId(null)}
                              onSaved={() => {
                                setEditingBlockId(null);
                                startTransition(() => router.refresh());
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                }

                // ── Class session row ────────────────────────────────────
                if (row.kind === "class") {
                  const cs = row.data;
                  const confirmedCount = cs.class_bookings.filter(b => b.status === "confirmed").length;
                  const isExpanded = expandedId === `class-${cs.id}`;
                  const isEditing  = editingClassId === cs.id;

                  return (
                    <React.Fragment key={`class-${cs.id}`}>
                      <tr
                        className={`cursor-pointer ${cs.active ? "hover:bg-[#fdfcfb]" : "opacity-60 hover:bg-[#fdfcfb]"}`}
                        onClick={() => setExpandedId(isExpanded ? null : `class-${cs.id}`)}
                      >
                        {/* Client column — badge + title */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium
                                             bg-[#fbb040]/15 text-[#9a7020] border border-[#fbb040]/40 shrink-0">
                              Class
                            </span>
                            <span className="font-medium text-[#1a1a1a] text-sm">{cs.title}</span>
                          </div>
                        </td>
                        {/* Service column — booked / capacity */}
                        <td className="px-4 py-3 text-[#1a1a1a]">
                          <span className={confirmedCount >= cs.capacity ? "text-amber-700 font-medium" : "text-emerald-700"}>
                            {confirmedCount}
                          </span>
                          <span className="text-[#9a8f87]"> / {cs.capacity} booked</span>
                          <div className="text-[#7a6f68] text-xs mt-0.5">{cs.duration_minutes} min</div>
                        </td>
                        {/* Date & Time */}
                        <td className="px-4 py-3 text-[#1a1a1a] whitespace-nowrap">
                          {formatAEST(cs.start_datetime)}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${
                            cs.active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-600 border-red-200"
                          }`}>
                            {cs.active ? "Scheduled" : "Cancelled"}
                          </span>
                        </td>
                        {/* Amount — not applicable */}
                        <td className="px-4 py-3 text-right text-[#c0b4ab]">—</td>
                        {/* Actions */}
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          {cs.active && (
                            <button
                              onClick={() => {
                                setExpandedId(`class-${cs.id}`);
                                setEditingClassId(isEditing ? null : cs.id);
                              }}
                              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                isEditing
                                  ? "border-[#044e77] bg-[#044e77] text-white"
                                  : "border-[#ddd8d2] text-[#5a504a] hover:border-[#044e77] hover:text-[#044e77]"
                              }`}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[#fdfcfb]">
                          <td colSpan={6} className="px-4 pb-4">
                            {isEditing ? (
                              <InlineClassEditor
                                session={cs}
                                onCancel={() => setEditingClassId(null)}
                                onSaved={() => {
                                  setEditingClassId(null);
                                  startTransition(() => router.refresh());
                                }}
                                onCancelled={() => {
                                  setEditingClassId(null);
                                  setExpandedId(null);
                                  startTransition(() => router.refresh());
                                }}
                              />
                            ) : (
                              <div className="pt-2 border-t border-[#f0ebe4] mt-1 space-y-3 text-sm">
                                {cs.description && (
                                  <div>
                                    <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Description</div>
                                    <div className="text-[#3a3330]">{cs.description}</div>
                                  </div>
                                )}
                                {cs.class_bookings.length > 0 ? (
                                  <div>
                                    <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-1.5">Registered Clients</div>
                                    <div className="space-y-1">
                                      {cs.class_bookings.map(b => (
                                        <div key={b.id} className="flex items-center gap-3 text-sm">
                                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                                            b.status === "confirmed" ? "bg-emerald-500" : "bg-[#c0b4ab]"
                                          }`} />
                                          <span className="font-medium text-[#1a1a1a]">
                                            {b.clients?.first_name} {b.clients?.last_name}
                                          </span>
                                          <span className="text-[#9a8f87] text-xs">{b.clients?.email}</span>
                                          {b.clients?.mobile && (
                                            <span className="text-[#9a8f87] text-xs">{b.clients.mobile}</span>
                                          )}
                                          <span className={`text-xs capitalize ml-auto ${
                                            b.status === "confirmed" ? "text-emerald-700" : "text-[#9a8f87]"
                                          }`}>{b.status}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[#9a8f87] text-xs italic">No clients registered yet.</div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                }

                // ── Appointment row ──────────────────────────────────────
                const appt = row.data;
                return (
                  <React.Fragment key={appt.id}>
                    <tr
                      className="hover:bg-[#fdfcfb] cursor-pointer"
                      onClick={() => setExpandedId(expandedId === appt.id ? null : appt.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-[#1a1a1a]">
                            {appt.clients?.first_name} {appt.clients?.last_name}
                          </span>
                          {appt.clients?.is_new_client && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold
                                             bg-[#fbb040] text-[#044e77] shrink-0">
                              New Client
                            </span>
                          )}
                          {(() => {
                            const intake = appt.intake_forms?.[0];
                            if (!intake) return null;
                            if (intake.status === "pending") {
                              return (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold
                                                 bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                                  Intake Pending
                                </span>
                              );
                            }
                            if (intake.status === "submitted") {
                              return (
                                <a href={`/admin/intake/${intake.id}`}
                                   className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold
                                              bg-blue-50 text-blue-700 border border-blue-200 shrink-0
                                              hover:bg-blue-100 transition-colors">
                                  Intake Submitted ↗
                                </a>
                              );
                            }
                            if (intake.status === "acknowledged") {
                              return (
                                <a href={`/admin/intake/${intake.id}`}
                                   className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold
                                              bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0
                                              hover:bg-emerald-100 transition-colors">
                                  Intake Acknowledged ↗
                                </a>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="text-[#7a6f68] text-xs">{appt.clients?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-[#1a1a1a]">
                        <div>{appt.services?.name ?? "—"}</div>
                        <div className="text-[#7a6f68] text-xs">{appt.services?.duration_minutes} min</div>
                      </td>
                      <td className="px-4 py-3 text-[#1a1a1a] whitespace-nowrap">
                        {formatAEST(appt.start_datetime)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${
                            STATUS_COLOURS[appt.status] ?? ""
                          }`}
                        >
                          {appt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-[#1a1a1a]">{formatPrice(appt.amount_paid_cents)}</div>
                        {appt.amount_paid_cents < appt.amount_cents && (
                          <div className="text-xs text-amber-600 font-medium whitespace-nowrap">
                            {formatPrice(appt.amount_cents - appt.amount_paid_cents)} outstanding
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {appt.status !== "cancelled" && (
                            <button
                              onClick={() => {
                                setExpandedId(appt.id);
                                setEditingId(editingId === appt.id ? null : appt.id);
                              }}
                              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                                editingId === appt.id
                                  ? "border-[#044e77] bg-[#044e77] text-white"
                                  : "border-[#ddd8d2] text-[#5a504a] hover:border-[#044e77] hover:text-[#044e77]"
                              }`}
                            >
                              Edit
                            </button>
                          )}
                          {appt.status === "confirmed" && (
                            <>
                              <button
                                disabled={updatingId === appt.id}
                                onClick={() => updateStatus(appt.id, "completed")}
                                className="text-xs px-2.5 py-1 rounded border border-blue-200 text-blue-700
                                           hover:bg-blue-50 transition-colors disabled:opacity-50"
                              >
                                Complete
                              </button>
                              <button
                                disabled={updatingId === appt.id}
                                onClick={() => {
                                  if (confirm(`Cancel appointment for ${appt.clients?.first_name}?`)) {
                                    updateStatus(appt.id, "cancelled");
                                  }
                                }}
                                className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600
                                           hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {appt.status === "cancelled" && (
                            <button
                              disabled={updatingId === appt.id}
                              onClick={() => updateStatus(appt.id, "confirmed")}
                              className="text-xs px-2.5 py-1 rounded border border-emerald-200 text-emerald-700
                                         hover:bg-emerald-50 transition-colors disabled:opacity-50"
                            >
                              Restore
                            </button>
                          )}
                          {updatingId === appt.id && (
                            <span className="text-xs text-[#7a6f68]">Saving…</span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedId === appt.id && (
                      <tr className="bg-[#fdfcfb]">
                        <td colSpan={6} className="px-4 pb-4">
                          {editingId === appt.id ? (
                            <EditApptForm
                              appt={appt}
                              onCancel={() => setEditingId(null)}
                              onSaved={() => {
                                setEditingId(null);
                                startTransition(() => router.refresh());
                              }}
                            />
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm pt-2 border-t border-[#f0ebe4] mt-1">
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Mobile</div>
                                <div>{appt.clients?.mobile ?? "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">New Client</div>
                                {appt.clients?.is_new_client ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fbb040] text-[#044e77]">
                                      Yes
                                    </span>
                                    <span className="text-xs text-[#7a6f68]">+15 min consultation</span>
                                  </div>
                                ) : (
                                  <div>No</div>
                                )}
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Service Total</div>
                                <div>{formatPrice(appt.amount_cents)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Paid</div>
                                <div>{formatPrice(appt.amount_paid_cents)}</div>
                              </div>
                              {appt.amount_paid_cents < appt.amount_cents && (
                                <div>
                                  <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Outstanding</div>
                                  <div className="text-amber-600 font-medium">
                                    {formatPrice(appt.amount_cents - appt.amount_paid_cents)}
                                  </div>
                                </div>
                              )}
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Square Payment ID</div>
                                <div className="font-mono text-xs break-all">{appt.square_payment_id ?? "—"}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Booked At</div>
                                <div>{formatAEST(appt.created_at)}</div>
                              </div>
                              {appt.notes && (
                                <div className="col-span-2 sm:col-span-4">
                                  <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Notes</div>
                                  <div>{appt.notes}</div>
                                </div>
                              )}
                              {appt.status === "pending_payment" && appt.payment_link_token && (
                                <div className="col-span-2 sm:col-span-4">
                                  <PaymentLinkRow
                                    appointmentId={appt.id}
                                    token={appt.payment_link_token}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        );
      })()}
    </div>
  );
}
