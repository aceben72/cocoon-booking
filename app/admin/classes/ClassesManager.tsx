"use client";

import { useState, useEffect, useTransition, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Session {
  id: string;
  class_type: string;
  title: string;
  start_datetime: string;
  duration_minutes: number;
  capacity: number;
  spots_remaining: number;
  description: string | null;
  active: boolean;
}

const CLASS_TYPE_LABELS: Record<string, string> = {
  masterclass:     "Make-Up Masterclass",
  mother_daughter: "Mother Daughter Make-Up Class",
};

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

function aestInputToISO(date: string, time: string) {
  return new Date(`${date}T${time}:00+10:00`).toISOString();
}

// 30-minute time options, 7:00 am – 7:00 pm
const CLASS_TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 7; h <= 19; h++) {
    for (const m of [0, 30]) {
      if (h === 19 && m === 30) break;
      const hh = h.toString().padStart(2, "0");
      const mm = m === 0 ? "00" : "30";
      const hour12 = h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "am" : "pm";
      opts.push({ value: `${hh}:${mm}`, label: `${hour12}:${mm} ${ampm}` });
    }
  }
  return opts;
})();

export function ClassesManager() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [upcoming, setUpcoming]   = useState<Session[]>([]);
  const [past, setPast]           = useState<Session[]>([]);
  const [cancelled, setCancelled] = useState<Session[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showPast, setShowPast]         = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  // Create form
  const [classType, setClassType]      = useState("masterclass");
  const [startDate, setStartDate]      = useState("");
  const [startTime, setStartTime]      = useState("");
  const [capacity, setCapacity]        = useState(4);
  const [description, setDescription] = useState("");
  const [creating, setCreating]        = useState(false);
  const [formError, setFormError]      = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/classes");
    if (res.ok) {
      const data = await res.json();
      setUpcoming(data.upcoming   ?? []);
      setPast(data.past           ?? []);
      setCancelled(data.cancelled ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setCreating(true);

    const res = await fetch("/api/admin/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class_type:     classType,
        start_datetime: aestInputToISO(startDate, startTime),
        capacity,
        description:    description || null,
      }),
    });

    if (res.ok) {
      setStartDate("");
      setStartTime("");
      setCapacity(4);
      setDescription("");
      await load();
      startTransition(() => router.refresh());
    } else {
      const { error } = await res.json();
      setFormError(error ?? "Failed to create session");
    }
    setCreating(false);
  }

  const booked = (s: Session) => s.capacity - s.spots_remaining;

  function SessionTable({ sessions, muted = false }: { sessions: Session[]; muted?: boolean }) {
    return (
      <div className={`bg-white rounded-xl border border-[#f0ebe4] overflow-hidden${muted ? " opacity-80" : ""}`}>
        <table className="w-full text-sm">
          <thead className="bg-[#f8f5f2] border-b border-[#f0ebe4]">
            <tr>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Class</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Date & Time</th>
              <th className="px-4 py-3 text-center text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Spots</th>
              <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[#7a6f68] font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0ebe4]">
            {sessions.map((s) => (
              <tr key={s.id} className={muted ? "" : "hover:bg-[#fdfcfb]"}>
                <td className="px-4 py-3">
                  <div className={`font-medium ${muted ? "text-[#7a6f68]" : "text-[#1a1a1a]"}`}>
                    {CLASS_TYPE_LABELS[s.class_type] ?? s.title}
                  </div>
                  {s.description && (
                    <div className="text-xs text-[#7a6f68] mt-0.5 truncate max-w-xs">{s.description}</div>
                  )}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap ${muted ? "text-[#7a6f68]" : "text-[#1a1a1a]"}`}>
                  {formatAEST(s.start_datetime)}
                </td>
                <td className="px-4 py-3 text-center">
                  {muted ? (
                    <span className="text-[#7a6f68]">{booked(s)} / {s.capacity}</span>
                  ) : (
                    <span
                      className={[
                        "font-medium",
                        s.spots_remaining === 0 ? "text-red-500" : s.spots_remaining <= 1 ? "text-amber-600" : "text-emerald-600",
                      ].join(" ")}
                    >
                      {booked(s)} / {s.capacity}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/classes/${s.id}`}
                    className={[
                      "text-xs px-2.5 py-1 rounded border transition-colors",
                      muted
                        ? "border-[#ddd8d2] text-[#7a6f68] hover:border-[#044e77] hover:text-[#044e77]"
                        : "border-[#ddd8d2] text-[#044e77] hover:border-[#044e77] hover:bg-[#044e77]/5",
                    ].join(" ")}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function CollapsibleSection({
    label,
    count,
    open,
    onToggle,
    children,
  }: {
    label: string;
    count: number;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }) {
    return (
      <div>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm text-[#7a6f68] hover:text-[#1a1a1a] transition-colors mb-3"
        >
          <svg
            className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {label} ({count})
        </button>
        {open && (count === 0 ? (
          <div className="bg-white rounded-xl border border-[#f0ebe4] p-6 text-center text-sm text-[#7a6f68]">
            None.
          </div>
        ) : children)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create session form */}
      <div className="bg-white rounded-xl border border-[#f0ebe4] p-6">
        <h2 className="text-sm font-medium text-[#1a1a1a] uppercase tracking-wider mb-4">
          Create New Session
        </h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">Class Type</label>
            <select
              value={classType}
              onChange={(e) => setClassType(e.target.value)}
              suppressHydrationWarning
              className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm bg-white
                         focus:outline-none focus:border-[#044e77]"
            >
              <option value="masterclass">Make-Up Masterclass</option>
              <option value="mother_daughter">Mother Daughter Make-Up Class</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">
              Start Date & Time (AEST)
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                suppressHydrationWarning
                className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm bg-white
                           focus:outline-none focus:border-[#044e77]"
              />
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                suppressHydrationWarning
                className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm bg-white
                           focus:outline-none focus:border-[#044e77]"
              >
                <option value="">— time —</option>
                {CLASS_TIME_OPTIONS.map(({ value, label: lbl }) => (
                  <option key={value} value={value}>{lbl}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">
              Capacity
            </label>
            <input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={20}
              required
              suppressHydrationWarning
              className="w-20 h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-center
                         focus:outline-none focus:border-[#044e77]"
            />
          </div>
          <div className="flex-1 min-w-56">
            <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Suitable for all skill levels"
              suppressHydrationWarning
              className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm
                         focus:outline-none focus:border-[#044e77]"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="h-10 bg-[#044e77] text-white rounded-lg px-5 text-sm
                       hover:bg-[#033d5e] transition-colors disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
        {formError && <p className="text-red-600 text-sm mt-3">{formError}</p>}
      </div>

      {/* Upcoming sessions */}
      <div>
        <h2 className="text-sm font-medium text-[#1a1a1a] uppercase tracking-wider mb-3">
          Upcoming Sessions ({upcoming.length})
        </h2>
        {loading ? (
          <div className="bg-white rounded-xl border border-[#f0ebe4] p-8 text-center text-sm text-[#7a6f68]">
            Loading…
          </div>
        ) : upcoming.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#f0ebe4] p-8 text-center text-sm text-[#7a6f68]">
            No upcoming sessions. Create one above.
          </div>
        ) : (
          <SessionTable sessions={upcoming} />
        )}
      </div>

      {/* Cancelled sessions — collapsible (only shown if there are any) */}
      {!loading && cancelled.length > 0 && (
        <CollapsibleSection
          label="Cancelled Sessions"
          count={cancelled.length}
          open={showCancelled}
          onToggle={() => setShowCancelled(!showCancelled)}
        >
          <SessionTable sessions={cancelled} muted />
        </CollapsibleSection>
      )}

      {/* Past sessions — collapsible */}
      <CollapsibleSection
        label="Past Classes"
        count={past.length}
        open={showPast}
        onToggle={() => setShowPast(!showPast)}
      >
        <SessionTable sessions={past} muted />
      </CollapsibleSection>
    </div>
  );
}
