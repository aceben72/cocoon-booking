"use client";

import { useState, useEffect } from "react";
import type { Service } from "@/types";
import { formatTime } from "@/lib/utils";

interface Props {
  service: Service;
  date: string;
  onSelect: (time: string) => void;
  onBack: () => void;
}

export default function StepTime({ service, date, onSelect, onBack }: Props) {
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/availability?serviceId=${service.id}&date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSlots(data.slots ?? []);
      })
      .catch((err) => setError(err.message ?? "Failed to load time slots"))
      .finally(() => setLoading(false));
  }, [service.id, date]);

  const displayDate = formatDateDisplay(date);

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-[#7a6f68] hover:text-[#044e77] mb-6 transition-colors font-light"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Change date
      </button>

      <h2 className="font-[family-name:var(--font-cormorant)] text-3xl font-light italic text-[#044e77] mb-1">
        Choose a time
      </h2>
      <p className="text-[#7a6f68] text-sm font-light mb-6">{displayDate}</p>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#f0ebe4] border-t-[#044e77] rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && slots.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-12 text-center">
          <p className="text-[#9a8f87] font-light mb-4">
            No available times on this date.
          </p>
          <button
            onClick={onBack}
            className="text-sm text-[#044e77] font-medium hover:underline"
          >
            Choose another date
          </button>
        </div>
      )}

      {!loading && !error && slots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {slots.map((slot) => (
            <button
              key={slot}
              onClick={() => onSelect(slot)}
              className="bg-white border border-[#e8e0d8] rounded-xl py-3 px-2 text-sm font-medium
                         text-[#1a1a1a] hover:border-[#044e77] hover:bg-[#044e77] hover:text-white
                         transition-all duration-150 text-center"
            >
              {formatTime(slot)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDateDisplay(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
