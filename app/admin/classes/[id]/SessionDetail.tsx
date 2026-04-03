"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Booking {
  id: string;
  status: string;
  amount_cents: number;
  square_payment_id: string | null;
  created_at: string;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    mobile: string;
  } | null;
}

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

// 30-minute time options, 7:00 am – 7:00 pm (matches ClassesManager)
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
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

function formatAEST(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function formatShort(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** Extract AEST "YYYY-MM-DD" from a UTC ISO string */
function toAESTDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date(iso));
}

/** Extract AEST "HH:MM" (24h, snapped to nearest :00/:30) from a UTC ISO string */
function toAESTTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Convert AEST date + time ("YYYY-MM-DD", "HH:MM") to UTC ISO string */
function aestToISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00+10:00`).toISOString();
}

export default function SessionDetail({
  session: initialSession,
  bookings: initialBookings,
}: {
  session: Session;
  bookings: Booking[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [session, setSession]   = useState(initialSession);
  const [bookings, setBookings] = useState(initialBookings);
  const [cancelling, setCancelling]     = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing]         = useState(false);
  const [editDate, setEditDate]       = useState("");
  const [editTime, setEditTime]       = useState("");
  const [editCapacity, setEditCapacity] = useState(session.capacity);
  const [editDescription, setEditDescription] = useState(session.description ?? "");
  const [saving, setSaving]           = useState(false);
  const [editError, setEditError]     = useState("");

  const confirmedBookings = bookings.filter((b) => b.status === "confirmed");
  const booked    = session.capacity - session.spots_remaining;
  const typeLabel = CLASS_TYPE_LABELS[session.class_type] ?? session.title;

  function openEdit() {
    setEditDate(toAESTDate(session.start_datetime));
    setEditTime(toAESTTime(session.start_datetime));
    setEditCapacity(session.capacity);
    setEditDescription(session.description ?? "");
    setEditError("");
    setEditing(true);
  }

  async function saveEdit() {
    if (!editDate || !editTime) {
      setEditError("Please select both a date and time.");
      return;
    }
    setSaving(true);
    setEditError("");

    const res = await fetch(`/api/admin/classes/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action:         "edit",
        start_datetime: aestToISO(editDate, editTime),
        capacity:       editCapacity,
        description:    editDescription || null,
      }),
    });

    const data = await res.json();
    if (res.ok && data.session) {
      setSession(data.session);
      setEditing(false);
      startTransition(() => router.refresh());
    } else {
      setEditError(data.error ?? "Failed to save changes.");
    }
    setSaving(false);
  }

  async function cancelSession() {
    if (!confirm(`Cancel the entire ${typeLabel} session on ${formatShort(session.start_datetime)}? This will notify all ${confirmedBookings.length} confirmed client(s).`)) return;
    setCancelling(true);

    const res = await fetch(`/api/admin/classes/${session.id}`, { method: "PATCH" });
    if (res.ok) {
      setSession((s) => ({ ...s, active: false }));
      setBookings((prev) => prev.map((b) => b.status === "confirmed" ? { ...b, status: "cancelled" } : b));
      startTransition(() => router.refresh());
    } else {
      alert("Failed to cancel session");
    }
    setCancelling(false);
  }

  async function cancelBooking(bookingId: string, clientName: string) {
    if (!confirm(`Cancel ${clientName}'s spot? They will be notified by email and SMS.`)) return;
    setCancellingId(bookingId);

    const res = await fetch(`/api/admin/classes/${session.id}/bookings/${bookingId}`, { method: "PATCH" });
    if (res.ok) {
      setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: "cancelled" } : b));
      setSession((s) => ({ ...s, spots_remaining: s.spots_remaining + 1 }));
      startTransition(() => router.refresh());
    } else {
      alert("Failed to cancel booking");
    }
    setCancellingId(null);
  }

  return (
    <div className="space-y-6">
      {/* Session header */}
      <div className="bg-white rounded-xl border border-[#f0ebe4] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#b0a499] mb-1">{typeLabel}</p>
            <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl mb-1">
              {formatAEST(session.start_datetime)}
            </h1>
            <p className="text-sm text-[#7a6f68] font-light">
              3 hours · {booked} / {session.capacity} spots booked
              {!session.active && (
                <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-xs font-medium">
                  Cancelled
                </span>
              )}
            </p>
            {session.description && !editing && (
              <p className="text-sm text-[#7a6f68] font-light mt-2">{session.description}</p>
            )}
          </div>

          {session.active && (
            <div className="flex items-center gap-2 shrink-0">
              {!editing && (
                <button
                  onClick={openEdit}
                  className="text-sm px-4 py-2 rounded-lg border border-[#ddd8d2] text-[#044e77]
                             hover:border-[#044e77] hover:bg-[#044e77]/5 transition-colors"
                >
                  Edit
                </button>
              )}
              {confirmedBookings.length > 0 && !editing && (
                <button
                  onClick={cancelSession}
                  disabled={cancelling}
                  className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-600
                             hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {cancelling ? "Cancelling…" : "Cancel Session"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Inline edit form */}
        {editing && (
          <div className="mt-5 pt-5 border-t border-[#f0ebe4]">
            <h3 className="text-xs uppercase tracking-wider text-[#7a6f68] mb-4">Edit Session</h3>
            <div className="flex flex-wrap gap-4 items-end">
              {/* Date */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  suppressHydrationWarning
                  className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm bg-white
                             focus:outline-none focus:border-[#044e77]"
                />
              </div>

              {/* Time */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">Time (AEST)</label>
                <select
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  required
                  suppressHydrationWarning
                  className="h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm bg-white
                             focus:outline-none focus:border-[#044e77]"
                >
                  <option value="">— time —</option>
                  {TIME_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Capacity */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">
                  Capacity
                  {booked > 0 && (
                    <span className="ml-1 text-amber-600 normal-case font-light">(min {booked} booked)</span>
                  )}
                </label>
                <input
                  type="number"
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(Math.max(booked || 1, parseInt(e.target.value) || 1))}
                  min={booked || 1}
                  max={20}
                  required
                  suppressHydrationWarning
                  className="w-20 h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-center
                             focus:outline-none focus:border-[#044e77]"
                />
              </div>

              {/* Description */}
              <div className="flex-1 min-w-48">
                <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="e.g. Suitable for all skill levels"
                  suppressHydrationWarning
                  className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm
                             focus:outline-none focus:border-[#044e77]"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="h-10 bg-[#044e77] text-white rounded-lg px-5 text-sm
                             hover:bg-[#033d5e] transition-colors disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="h-10 px-4 text-sm text-[#7a6f68] hover:text-[#1a1a1a] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
            {editError && <p className="text-red-600 text-sm mt-3">{editError}</p>}
          </div>
        )}
      </div>

      {/* Bookings list */}
      <div>
        <h2 className="text-sm font-medium text-[#1a1a1a] uppercase tracking-wider mb-3">
          Bookings ({confirmedBookings.length} confirmed)
        </h2>

        {bookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#f0ebe4] p-10 text-center text-sm text-[#7a6f68]">
            No bookings yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#f0ebe4] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f5f2] border-b border-[#f0ebe4]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Client</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Mobile</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Booked</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Status</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[#7a6f68] font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ebe4]">
                {bookings.map((booking) => {
                  const client     = booking.clients;
                  const clientName = client ? `${client.first_name} ${client.last_name}` : "Unknown";
                  const isCancelled = booking.status === "cancelled";

                  return (
                    <tr key={booking.id} className={isCancelled ? "opacity-50" : "hover:bg-[#fdfcfb]"}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1a1a1a]">{clientName}</div>
                        <div className="text-xs text-[#7a6f68]">{client?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-[#1a1a1a]">{client?.mobile ?? "—"}</td>
                      <td className="px-4 py-3 text-[#7a6f68] whitespace-nowrap">{formatShort(booking.created_at)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "inline-block px-2 py-0.5 rounded-full border text-xs font-medium capitalize",
                            isCancelled
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200",
                          ].join(" ")}
                        >
                          {booking.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isCancelled && session.active && (
                          <button
                            disabled={cancellingId === booking.id}
                            onClick={() => cancelBooking(booking.id, clientName)}
                            className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600
                                       hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {cancellingId === booking.id ? "Cancelling…" : "Cancel"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
