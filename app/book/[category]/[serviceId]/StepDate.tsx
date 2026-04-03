"use client";

import { useState, useMemo } from "react";
import type { Service } from "@/types";
import { isBookableDate, DEFAULT_AVAILABILITY } from "@/lib/availability";
import { toAESTDateString } from "@/lib/utils";

interface Props {
  service: Service;
  onSelect: (date: string) => void;
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function StepDate({ service, onSelect }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayStr = toAESTDateString(today);

  // Start calendar at current month
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-indexed

  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 60);
    return d;
  }, [today]);

  const calDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const mo = String(calMonth + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      days.push(`${calYear}-${mo}-${dd}`);
    }
    return days;
  }, [calYear, calMonth]);

  const canGoPrev = calYear > today.getFullYear() || calMonth > today.getMonth();
  const canGoNext = useMemo(() => {
    const nextMonth = new Date(calYear, calMonth + 1, 1);
    return nextMonth <= maxDate;
  }, [calYear, calMonth, maxDate]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  return (
    <div>
      <h2 className="font-[family-name:var(--font-cormorant)] text-3xl font-light italic text-[#044e77] mb-6">
        Choose a date
      </h2>

      <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={prevMonth}
            disabled={!canGoPrev}
            className="w-9 h-9 rounded-full flex items-center justify-center
                       text-[#7a6f68] hover:bg-[#f0ebe4] disabled:opacity-30 disabled:cursor-not-allowed
                       transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-[family-name:var(--font-cormorant)] text-xl font-medium text-[#1a1a1a]">
            {MONTH_NAMES[calMonth]} {calYear}
          </span>
          <button
            onClick={nextMonth}
            disabled={!canGoNext}
            className="w-9 h-9 rounded-full flex items-center justify-center
                       text-[#7a6f68] hover:bg-[#f0ebe4] disabled:opacity-30 disabled:cursor-not-allowed
                       transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-xs text-[#b0a499] font-light py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {calDays.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} />;

            const bookable = isBookableDate(dateStr, DEFAULT_AVAILABILITY);
            const isPast = dateStr < todayStr;

            return (
              <button
                key={dateStr}
                disabled={!bookable || isPast}
                onClick={() => onSelect(dateStr)}
                className={[
                  "aspect-square rounded-full flex items-center justify-center text-sm transition-all",
                  bookable && !isPast
                    ? "text-[#1a1a1a] hover:bg-[#044e77] hover:text-white cursor-pointer font-medium"
                    : "text-[#d0c8c0] cursor-not-allowed",
                  dateStr === todayStr ? "ring-1 ring-[#fbb040]" : "",
                ].join(" ")}
              >
                {parseInt(dateStr.split("-")[2], 10)}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-5 pt-5 border-t border-[#f0ebe4]">
          <div className="flex items-center gap-1.5 text-xs text-[#9a8f87] font-light">
            <div className="w-3 h-3 rounded-full bg-[#044e77]" /> Available
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#9a8f87] font-light">
            <div className="w-3 h-3 rounded-full bg-[#e8e0d8]" /> Unavailable
          </div>
        </div>
      </div>

      <p className="text-xs text-[#b0a499] text-center mt-4 font-light">
        Open Thursday–Sunday · Same-day bookings available up to 2 hours ahead
      </p>
    </div>
  );
}
