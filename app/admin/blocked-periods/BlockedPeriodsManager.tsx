"use client";

import { useState, useTransition, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface BlockedPeriod {
  id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
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

// Convert AEST date + time ("YYYY-MM-DD", "HH:MM") to UTC ISO string
function aestToISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00+10:00`).toISOString();
}

// 30-minute time options from 06:00 to 22:00
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break;
      const hh = h.toString().padStart(2, "0");
      const mm = m === 0 ? "00" : "30";
      const value = `${hh}:${mm}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "am" : "pm";
      opts.push({ value, label: `${hour12}:${mm} ${ampm}` });
    }
  }
  return opts;
})();

function DateTimeSelect({
  label,
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  label: string;
  date: string;
  time: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">
        {label} (AEST)
      </label>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          required
          suppressHydrationWarning
          className="border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:border-[#044e77] bg-white"
        />
        <select
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          required
          suppressHydrationWarning
          className="border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm bg-white
                     focus:outline-none focus:border-[#044e77]"
        >
          <option value="">— time —</option>
          {TIME_OPTIONS.map(({ value, label: lbl }) => (
            <option key={value} value={value}>{lbl}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function BlockedPeriodsManager({ periods: initial }: { periods: BlockedPeriod[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [periods, setPeriods] = useState(initial);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Split date/time state for start and end
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [endTime, setEndTime]     = useState("");
  const [reason, setReason]       = useState("");

  function handleStartDateChange(v: string) {
    setStartDate(v);
    setEndDate(v);   // mirror date
  }

  function handleStartTimeChange(v: string) {
    setStartTime(v);
    setEndTime(v);   // mirror time
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!startDate || !startTime || !endDate || !endTime) {
      setFormError("Please select both a date and time for start and end.");
      return;
    }

    setSubmitting(true);

    const start_datetime = aestToISO(startDate, startTime);
    const end_datetime   = aestToISO(endDate, endTime);

    if (new Date(end_datetime) <= new Date(start_datetime)) {
      setFormError("End must be after start.");
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/admin/blocked-periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_datetime, end_datetime, reason: reason || null }),
    });

    if (res.ok) {
      const newPeriod = await res.json();
      setPeriods((prev) =>
        [...prev, newPeriod].sort(
          (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime(),
        ),
      );
      setStartDate(""); setStartTime("");
      setEndDate("");   setEndTime("");
      setReason("");
      startTransition(() => router.refresh());
    } else {
      const { error } = await res.json();
      setFormError(error ?? "Failed to add blocked period");
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this blocked period?")) return;
    setDeletingId(id);

    const res = await fetch(`/api/admin/blocked-periods/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPeriods((prev) => prev.filter((p) => p.id !== id));
      startTransition(() => router.refresh());
    } else {
      alert("Failed to delete");
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="bg-white rounded-xl border border-[#f0ebe4] p-6">
        <h2 className="text-sm font-medium text-[#1a1a1a] mb-4 uppercase tracking-wider">
          Add Blocked Period
        </h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-4 items-end">
          <DateTimeSelect
            label="Start"
            date={startDate}
            time={startTime}
            onDateChange={handleStartDateChange}
            onTimeChange={handleStartTimeChange}
          />
          <DateTimeSelect
            label="End"
            date={endDate}
            time={endTime}
            onDateChange={setEndDate}
            onTimeChange={setEndTime}
          />
          <div className="flex-1 min-w-48">
            <label className="block text-xs uppercase tracking-wider text-[#7a6f68] mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Public holiday"
              className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:border-[#044e77]"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#044e77] text-white rounded-lg px-5 py-2 text-sm
                       hover:bg-[#033d5e] transition-colors disabled:opacity-60"
          >
            {submitting ? "Adding…" : "Add"}
          </button>
        </form>
        {formError && <p className="text-red-600 text-sm mt-3">{formError}</p>}
      </div>

      {/* List */}
      {periods.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#f0ebe4] p-12 text-center text-[#7a6f68]">
          No blocked periods configured.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#f0ebe4] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f5f2] border-b border-[#f0ebe4]">
              <tr>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Start</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">End</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#7a6f68] font-medium">Reason</th>
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[#7a6f68] font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebe4]">
              {periods.map((p) => (
                <tr key={p.id} className="hover:bg-[#fdfcfb]">
                  <td className="px-4 py-3 text-[#1a1a1a] whitespace-nowrap">{formatAEST(p.start_datetime)}</td>
                  <td className="px-4 py-3 text-[#1a1a1a] whitespace-nowrap">{formatAEST(p.end_datetime)}</td>
                  <td className="px-4 py-3 text-[#7a6f68]">{p.reason ?? <em className="text-[#b0a499]">—</em>}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={deletingId === p.id}
                      onClick={() => handleDelete(p.id)}
                      className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600
                                 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deletingId === p.id ? "Removing…" : "Remove"}
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
