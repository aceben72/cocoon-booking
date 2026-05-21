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

interface AvailableSession {
  id: string;
  class_type: string;
  title: string;
  start_datetime: string;
  spots_remaining: number;
}

interface MoveTarget {
  bookingIds: string[];
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  quantity: number;
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

function formatSessionOption(iso: string, spotsRemaining: number) {
  const weekday = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  const spots = spotsRemaining === 1 ? "1 spot" : `${spotsRemaining} spots`;
  return `${weekday} · ${time} · ${spots} available`;
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

  // Move modal state
  const [moveTarget, setMoveTarget]           = useState<MoveTarget | null>(null);
  const [availableSessions, setAvailableSessions] = useState<AvailableSession[]>([]);
  const [loadingTargets, setLoadingTargets]   = useState(false);
  const [targetSessionId, setTargetSessionId] = useState("");
  const [moving, setMoving]                   = useState(false);
  const [moveError, setMoveError]             = useState("");

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

  async function openMoveModal(clientEmail: string, clientName: string, clientMobile: string) {
    // Collect all confirmed booking IDs for this client in this session
    const clientBookings = confirmedBookings.filter((b) => b.clients?.email === clientEmail);
    const bookingIds = clientBookings.map((b) => b.id);

    setMoveTarget({
      bookingIds,
      clientName,
      clientEmail,
      clientMobile,
      quantity: clientBookings.length,
    });
    setTargetSessionId("");
    setMoveError("");
    setAvailableSessions([]);
    setLoadingTargets(true);

    try {
      const res = await fetch("/api/admin/classes");
      const data = await res.json() as { upcoming?: AvailableSession[] };
      const upcoming = data.upcoming ?? [];

      // Filter: same class type, not current session, enough spots
      const filtered = upcoming.filter(
        (s) =>
          s.class_type === session.class_type &&
          s.id !== session.id &&
          (s.spots_remaining as number) >= bookingIds.length,
      );
      setAvailableSessions(filtered);
    } catch {
      setMoveError("Failed to load available sessions. Please try again.");
    } finally {
      setLoadingTargets(false);
    }
  }

  function closeMoveModal() {
    setMoveTarget(null);
    setTargetSessionId("");
    setMoveError("");
    setMoving(false);
  }

  async function confirmMove() {
    if (!moveTarget || !targetSessionId) return;
    setMoving(true);
    setMoveError("");

    const res = await fetch("/api/admin/class-bookings/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class_booking_ids: moveTarget.bookingIds,
        target_session_id: targetSessionId,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMoveError(data.error ?? "Failed to move booking. Please try again.");
      setMoving(false);
      return;
    }

    // Remove the moved bookings from the local state
    const movedIds = new Set(moveTarget.bookingIds);
    setBookings((prev) => prev.filter((b) => !movedIds.has(b.id)));
    setSession((s) => ({
      ...s,
      spots_remaining: s.spots_remaining + moveTarget.quantity,
    }));
    closeMoveModal();
    startTransition(() => router.refresh());
  }

  // Track which clients have already had a Move button rendered in this pass
  // (prevents duplicate Move buttons for clients with multiple tickets)
  const renderedMoveClients = new Set<string>();

  return (
    <>
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
                    const clientEmail = client?.email ?? "";
                    const isCancelled = booking.status === "cancelled";

                    // Only render Move button on the first confirmed row per client
                    // (a client's subsequent ticket rows share the same Move action)
                    const showMove = !isCancelled && session.active && !renderedMoveClients.has(clientEmail);
                    if (!isCancelled && clientEmail) renderedMoveClients.add(clientEmail);

                    // Count how many confirmed tickets this client has (for the modal)
                    const clientTicketCount = confirmedBookings.filter(
                      (b) => b.clients?.email === clientEmail,
                    ).length;

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
                            <div className="flex items-center gap-2 justify-end">
                              {showMove && (
                                <button
                                  onClick={() =>
                                    openMoveModal(clientEmail, clientName, client?.mobile ?? "")
                                  }
                                  className="text-xs px-2.5 py-1 rounded border border-amber-300 text-amber-700
                                             hover:bg-amber-50 transition-colors"
                                >
                                  Move{clientTicketCount > 1 ? ` (${clientTicketCount})` : ""}
                                </button>
                              )}
                              <button
                                disabled={cancellingId === booking.id}
                                onClick={() => cancelBooking(booking.id, clientName)}
                                className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600
                                           hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {cancellingId === booking.id ? "Cancelling…" : "Cancel"}
                              </button>
                            </div>
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

      {/* ── Move Booking Modal ─────────────────────────────────────────────── */}
      {moveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closeMoveModal(); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            {/* Modal header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-2xl leading-tight">
                  Move Booking
                </h2>
                <p className="text-xs text-[#9a8f87] mt-0.5">{typeLabel}</p>
              </div>
              <button
                onClick={closeMoveModal}
                className="text-[#b0a499] hover:text-[#7a6f68] transition-colors mt-0.5"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Client + current session summary */}
            <div className="bg-[#f8f5f2] rounded-xl p-4 mb-5 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Client</span>
                <span className="font-medium text-[#1a1a1a]">{moveTarget.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Tickets</span>
                <span className="font-medium text-[#1a1a1a]">
                  {moveTarget.quantity} {moveTarget.quantity === 1 ? "ticket" : "tickets"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Current session</span>
                <span className="font-medium text-[#1a1a1a] text-right max-w-[60%]">
                  {formatShort(session.start_datetime)}
                </span>
              </div>
            </div>

            {/* Target session selector */}
            <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-2">
              Move to
            </label>

            {loadingTargets ? (
              <div className="flex items-center gap-2 text-sm text-[#9a8f87] py-3">
                <span className="w-4 h-4 border-2 border-[#e8e0d8] border-t-[#fbb040] rounded-full animate-spin" />
                Loading available sessions…
              </div>
            ) : availableSessions.length === 0 ? (
              <p className="text-sm text-[#7a6f68] py-3">
                No other sessions available with enough spots for{" "}
                {moveTarget.quantity === 1 ? "this ticket" : `these ${moveTarget.quantity} tickets`}.
              </p>
            ) : (
              <select
                value={targetSessionId}
                onChange={(e) => { setTargetSessionId(e.target.value); setMoveError(""); }}
                className="w-full h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm bg-white
                           focus:outline-none focus:border-[#fbb040] mb-1"
              >
                <option value="">— choose a session —</option>
                {availableSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatSessionOption(s.start_datetime, s.spots_remaining)}
                  </option>
                ))}
              </select>
            )}

            {/* Error message */}
            {moveError && (
              <p className="text-sm text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                {moveError}
              </p>
            )}

            {/* Footer actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={closeMoveModal}
                disabled={moving}
                className="flex-1 h-10 rounded-lg border border-[#ddd8d2] text-sm text-[#7a6f68]
                           hover:text-[#1a1a1a] hover:border-[#b0a499] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmMove}
                disabled={!targetSessionId || moving || loadingTargets}
                className="flex-1 h-10 rounded-lg bg-[#fbb040] text-[#044e77] text-sm font-medium
                           hover:bg-[#f5a830] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {moving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-[#044e77]/30 border-t-[#044e77] rounded-full animate-spin" />
                    Moving…
                  </span>
                ) : (
                  "Move Booking"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
