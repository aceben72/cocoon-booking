"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CLASS_TYPE_LABELS } from "@/lib/class-types";
import type { ClassType } from "@/types";

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

export function ClassesManager() {
  const [upcoming, setUpcoming]   = useState<Session[]>([]);
  const [past, setPast]           = useState<Session[]>([]);
  const [cancelled, setCancelled] = useState<Session[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showPast, setShowPast]         = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

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
                    {CLASS_TYPE_LABELS[s.class_type as ClassType] ?? s.title}
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
      {/* Group classes retired Nov 2026: the make-up lessons are now private
          bookings (Private, Me & a Friend, Mother & Daughter) made like a facial.
          Sessions already scheduled stay here so they can be run and completed. */}
      <div className="bg-[#f8f5f2] rounded-xl border border-[#f0ebe4] px-6 py-4 text-sm text-[#5a504a]">
        Group classes are no longer scheduled. Make-up lessons are now private bookings — add them from
        Appointments. Sessions already on the calendar stay below and still work as before.
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
            No upcoming sessions.
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
