"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { NewBookingForm } from "./appointments/NewBookingForm";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CalendarAppointment {
  id: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
  notes: string | null;
  services: { name: string; duration_minutes: number } | null;
  clients: { first_name: string; last_name: string; is_new_client?: boolean } | null;
}

interface CalendarBlockedPeriod {
  id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
}

interface CalendarClassBooking {
  id: string;
  status: string;
  clients: { first_name: string; last_name: string; email: string; mobile: string } | null;
}

interface CalendarClassSession {
  id: string;
  class_type: string;
  title: string;
  start_datetime: string;
  duration_minutes: number;
  capacity: number;
  description: string | null;
  active: boolean;
  class_bookings: CalendarClassBooking[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 60; // px per hour
const DAY_START   = 7;  // 7 am
const DAY_END     = 21; // 9 pm  (last gridline)
const TOTAL_HOURS = DAY_END - DAY_START; // 14 slots
const HOUR_MARKS  = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => DAY_START + i);
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 6; h <= 22; h++) {
  for (const min of [0, 30]) {
    if (h === 22 && min === 30) continue;
    const hh = String(h).padStart(2, "0");
    const mm = String(min).padStart(2, "0");
    const period = h < 12 ? "am" : "pm";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    TIME_OPTIONS.push({ value: `${hh}:${mm}`, label: `${h12}:${mm}${period}` });
  }
}

// ─── Utils ─────────────────────────────────────────────────────────────────

function todayAEST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, "0"),
    String(dt.getDate()).padStart(2, "0"),
  ].join("-");
}

function weekSunday(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return addDays(dateStr, -new Date(y, m - 1, d).getDay());
}

function getWeekDates(anchor: string): string[] {
  const sun = weekSunday(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(sun, i));
}

function toAESTDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date(iso));
}

function aestHM(iso: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
  const m = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
  return { h: h === 24 ? 0 : h, m };
}

function topPx(iso: string): number {
  const { h, m } = aestHM(iso);
  return Math.max(0, (h - DAY_START + m / 60) * HOUR_HEIGHT);
}

function heightPx(startIso: string, endIso: string): number {
  const s = aestHM(startIso);
  const e = aestHM(endIso);
  const mins = (e.h * 60 + e.m) - (s.h * 60 + s.m);
  return Math.max(mins > 0 ? (mins / 60) * HOUR_HEIGHT : 30, 28);
}

function aestToISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00+10:00`).toISOString();
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function fmtDateHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

function hourLabel(h: number): string {
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function apptColors(status: string) {
  switch (status) {
    case "confirmed": return "bg-[#dbeafe] border-l-[#044e77] text-[#044e77]";
    case "completed": return "bg-emerald-50 border-l-emerald-500 text-emerald-800";
    case "pending":   return "bg-amber-50 border-l-amber-400 text-amber-800";
    case "cancelled": return "bg-red-50 border-l-red-300 text-red-600 opacity-60";
    default:          return "bg-gray-50 border-l-gray-300 text-gray-700";
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function MobileCalendar() {
  const today = todayAEST();

  const [selectedDate, setSelectedDate] = useState(today);
  const [weekAnchor, setWeekAnchor]     = useState(today);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [blocked, setBlocked]           = useState<CalendarBlockedPeriod[]>([]);
  const [classSessions, setClassSessions] = useState<CalendarClassSession[]>([]);
  const [loading, setLoading]           = useState(false);

  // FAB / bottom sheet
  const [fabOpen,        setFabOpen]        = useState(false);
  const [blockSheet,     setBlockSheet]     = useState(false);
  const [newBookingSheet, setNewBookingSheet] = useState(false);
  const [blockDate,    setBlockDate]    = useState(today);
  const [blockStart,   setBlockStart]   = useState("09:00");
  const [blockEnd,     setBlockEnd]     = useState("10:00");
  const [blockReason,  setBlockReason]  = useState("");
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [blockConflict,         setBlockConflict]         = useState<string | null>(null);
  const [blockConflictChecking, setBlockConflictChecking] = useState(false);

  // ── Appointment detail + edit sheet ─────────────────────────────────────
  const [selectedAppt,    setSelectedAppt]    = useState<CalendarAppointment | null>(null);
  const [apptDetailOpen,  setApptDetailOpen]  = useState(false);
  const [apptEditOpen,    setApptEditOpen]    = useState(false);
  const [apptEditDate,    setApptEditDate]    = useState("");
  const [apptEditTime,    setApptEditTime]    = useState("");
  const [apptEditNotes,   setApptEditNotes]   = useState("");
  const [apptEditSaving,  setApptEditSaving]  = useState(false);
  const [apptEditError,   setApptEditError]   = useState<string | null>(null);
  const [apptEditSaved,   setApptEditSaved]   = useState(false);
  const [apptEditConflict,         setApptEditConflict]         = useState<string | null>(null);
  const [apptEditConflictChecking, setApptEditConflictChecking] = useState(false);

  // ── Class session detail + edit sheet ───────────────────────────────────
  const [selectedClass,    setSelectedClass]    = useState<CalendarClassSession | null>(null);
  const [classDetailOpen,  setClassDetailOpen]  = useState(false);
  const [classEditOpen,    setClassEditOpen]    = useState(false);
  const [csEditDate,       setCsEditDate]       = useState("");
  const [csEditTime,       setCsEditTime]       = useState("09:00");
  const [csEditCapacity,   setCsEditCapacity]   = useState("");
  const [csEditDesc,       setCsEditDesc]       = useState("");
  const [csEditSaving,     setCsEditSaving]     = useState(false);
  const [csEditError,      setCsEditError]      = useState<string | null>(null);
  const [csEditSaved,      setCsEditSaved]      = useState(false);
  const [csCancelling,     setCsCancelling]     = useState(false);

  // ── Blocked period detail + edit sheet ──────────────────────────────────
  const [selectedBlock,   setSelectedBlock]   = useState<CalendarBlockedPeriod | null>(null);
  const [blockDetailOpen, setBlockDetailOpen] = useState(false);
  const [blockEditOpen,   setBlockEditOpen]   = useState(false);
  const [bEditDate,       setBEditDate]       = useState("");
  const [bEditStart,      setBEditStart]      = useState("09:00");
  const [bEditEnd,        setBEditEnd]        = useState("10:00");
  const [bEditReason,     setBEditReason]     = useState("");
  const [bEditSaving,     setBEditSaving]     = useState(false);
  const [bEditError,      setBEditError]      = useState<string | null>(null);
  const [bDeleting,       setBDeleting]       = useState(false);
  const [bEditConflict,         setBEditConflict]         = useState<string | null>(null);
  const [bEditConflictChecking, setBEditConflictChecking] = useState(false);

  const timelineRef  = useRef<HTMLDivElement>(null);
  const swipeStartX  = useRef<number | null>(null);

  const handleWeekSwipeStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
  };

  const handleWeekSwipeEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(delta) < 50) return; // too short — let tap events fire normally
    navigate(delta < 0 ? 7 : -7);    // left swipe → next week, right → prev week
  };
  const weekDates   = getWeekDates(weekAnchor);

  // ── Fetch ───────────────────────────────────────────────────────────────

  const fetchDay = useCallback((date: string) => {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/appointments?from=${date}&to=${date}`).then(r => r.json()),
      fetch("/api/admin/blocked-periods").then(r => r.json()),
      fetch(`/api/admin/classes?from=${date}&to=${date}`).then(r => r.json()),
    ])
      .then(([appts, bps, classes]) => {
        setAppointments(Array.isArray(appts) ? appts : []);
        setBlocked(
          (Array.isArray(bps) ? bps : []).filter(
            (bp: CalendarBlockedPeriod) =>
              toAESTDate(bp.start_datetime) === date ||
              toAESTDate(bp.end_datetime) === date,
          ),
        );
        setClassSessions(Array.isArray(classes) ? classes : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchDay(selectedDate); }, [selectedDate, fetchDay]);

  // ── Auto-scroll timeline ─────────────────────────────────────────────────

  useEffect(() => {
    if (!timelineRef.current) return;
    let offset: number;
    if (selectedDate === today) {
      const { h, m } = aestHM(new Date().toISOString());
      offset = Math.max(0, (h - DAY_START - 1.5 + m / 60) * HOUR_HEIGHT);
    } else {
      offset = (9 - DAY_START) * HOUR_HEIGHT; // 9 am default
    }
    timelineRef.current.scrollTop = offset;
  }, [selectedDate, today]);

  // ── Week navigation ──────────────────────────────────────────────────────

  const navigate = (delta: 7 | -7) => {
    setWeekAnchor(prev => {
      const newAnchor = addDays(prev, delta);
      // Keep selected date in sync — same weekday in new week
      const [y, m, d] = selectedDate.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      setSelectedDate(addDays(weekSunday(newAnchor), dow));
      return newAnchor;
    });
  };

  const selectDay = (date: string) => {
    setSelectedDate(date);
    setWeekAnchor(date);
  };

  // ── Block time submit ────────────────────────────────────────────────────

  const handleBlockSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blocked-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_datetime: aestToISO(blockDate, blockStart),
          end_datetime:   aestToISO(blockDate, blockEnd),
          reason: blockReason || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSaveError((j as { error?: string }).error ?? "Failed to save");
        return;
      }
      setFabOpen(false);
      setBlockSheet(false);
      setBlockReason("");
      setBlockConflict(null);
      fetchDay(selectedDate);
    } finally {
      setSaving(false);
    }
  };

  // ── Block-time conflict check ─────────────────────────────────────────────
  // Runs 400 ms after date/start/end change, only when the block sheet is open.

  useEffect(() => {
    if (!blockSheet) return;
    setBlockConflict(null);
    if (!blockDate || !blockStart || !blockEnd) return;

    const startISO = aestToISO(blockDate, blockStart);
    const endISO   = aestToISO(blockDate, blockEnd);
    if (new Date(startISO) >= new Date(endISO)) return; // invalid range

    const timer = setTimeout(async () => {
      setBlockConflictChecking(true);
      try {
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
        setBlockConflict(`This period overlaps with ${parts.join(" and ")}. You can still proceed if intended.`);
      } catch {
        // Advisory only — silently ignore errors
      } finally {
        setBlockConflictChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [blockSheet, blockDate, blockStart, blockEnd]);

  // ── Appointment edit conflict check ──────────────────────────────────────

  useEffect(() => {
    if (!apptEditOpen || !selectedAppt) return;
    setApptEditConflict(null);
    if (!apptEditDate || !apptEditTime) return;

    const timer = setTimeout(async () => {
      setApptEditConflictChecking(true);
      try {
        const startISO = aestToISO(apptEditDate, apptEditTime);
        const durationMs = (selectedAppt.services?.duration_minutes ?? 60) * 60_000;
        const endISO = new Date(new Date(startISO).getTime() + durationMs).toISOString();
        const res = await fetch(
          `/api/admin/conflict-check?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}&excludeId=${selectedAppt.id}`,
        );
        if (!res.ok) return;
        const data = await res.json() as { conflict: boolean; appointmentCount: number; blockedPeriodCount: number };
        if (!data.conflict) return;
        const parts: string[] = [];
        if (data.appointmentCount  > 0) parts.push(`${data.appointmentCount} appointment${data.appointmentCount > 1 ? "s" : ""}`);
        if (data.blockedPeriodCount > 0) parts.push(`${data.blockedPeriodCount} blocked period${data.blockedPeriodCount > 1 ? "s" : ""}`);
        setApptEditConflict(`Overlaps with ${parts.join(" and ")}. You can still save if intended.`);
      } catch { /* advisory */ } finally {
        setApptEditConflictChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [apptEditOpen, apptEditDate, apptEditTime, selectedAppt]);

  // ── Blocked period edit conflict check ────────────────────────────────────

  useEffect(() => {
    if (!blockEditOpen) return;
    setBEditConflict(null);
    if (!bEditDate || !bEditStart || !bEditEnd) return;

    const startISO = aestToISO(bEditDate, bEditStart);
    const endISO   = aestToISO(bEditDate, bEditEnd);
    if (new Date(startISO) >= new Date(endISO)) return;

    const excludeId = selectedBlock?.id;
    const timer = setTimeout(async () => {
      setBEditConflictChecking(true);
      try {
        const url = `/api/admin/conflict-check?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}${excludeId ? `&excludeId=${excludeId}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json() as { conflict: boolean; appointmentCount: number; blockedPeriodCount: number };
        if (!data.conflict) return;
        const parts: string[] = [];
        if (data.appointmentCount  > 0) parts.push(`${data.appointmentCount} appointment${data.appointmentCount > 1 ? "s" : ""}`);
        if (data.blockedPeriodCount > 0) parts.push(`${data.blockedPeriodCount} blocked period${data.blockedPeriodCount > 1 ? "s" : ""}`);
        setBEditConflict(`Overlaps with ${parts.join(" and ")}. You can still save if intended.`);
      } catch { /* advisory */ } finally {
        setBEditConflictChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [blockEditOpen, bEditDate, bEditStart, bEditEnd, selectedBlock?.id]);

  // ── Open appointment detail sheet ─────────────────────────────────────────

  function openApptDetail(appt: CalendarAppointment) {
    setSelectedAppt(appt);
    setApptDetailOpen(true);
    setApptEditOpen(false);
    setApptEditError(null);
    setApptEditConflict(null);
    setApptEditSaved(false);
  }

  function openApptEdit(appt: CalendarAppointment) {
    const d = new Date(appt.start_datetime);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(d);
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Brisbane",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const rawH = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
    const rawM = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
    const h = rawH === 24 ? 0 : rawH;
    const snappedM = rawM < 15 ? "00" : rawM < 45 ? "30" : "00";
    const snappedH = rawM >= 45 ? h + 1 : h;
    const time = `${String(snappedH).padStart(2, "0")}:${snappedM}`;
    setApptEditDate(date);
    setApptEditTime(time);
    setApptEditNotes(appt.notes ?? "");
    setApptEditOpen(true);
    setApptEditError(null);
    setApptEditConflict(null);
    setApptEditSaved(false);
  }

  async function handleApptEditSave() {
    if (!selectedAppt) return;
    setApptEditSaving(true);
    setApptEditError(null);
    try {
      const res = await fetch(`/api/admin/appointments/${selectedAppt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: apptEditDate, time: apptEditTime, notes: apptEditNotes }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setApptEditError(d.error ?? "Failed to update");
        return;
      }
      setApptEditSaved(true);
      fetchDay(selectedDate);
      setTimeout(() => {
        setApptDetailOpen(false);
        setApptEditOpen(false);
        setSelectedAppt(null);
        setApptEditSaved(false);
      }, 1200);
    } catch {
      setApptEditError("An unexpected error occurred");
    } finally {
      setApptEditSaving(false);
    }
  }

  // ── Open blocked period detail/edit sheet ─────────────────────────────────

  function openBlockDetail(bp: CalendarBlockedPeriod) {
    setSelectedBlock(bp);
    setBlockDetailOpen(true);
    setBlockEditOpen(false);
    setBEditError(null);
    setBEditConflict(null);
  }

  function openBlockEdit(bp: CalendarBlockedPeriod) {
    setBEditDate(toAESTDate(bp.start_datetime));
    setBEditStart((() => {
      const { h, m } = aestHM(bp.start_datetime);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    })());
    setBEditEnd((() => {
      const { h, m } = aestHM(bp.end_datetime);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    })());
    setBEditReason(bp.reason ?? "");
    setBlockEditOpen(true);
    setBEditError(null);
    setBEditConflict(null);
  }

  async function handleBlockEditSave() {
    if (!selectedBlock) return;
    setBEditSaving(true);
    setBEditError(null);
    try {
      const res = await fetch(`/api/admin/blocked-periods/${selectedBlock.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_datetime: aestToISO(bEditDate, bEditStart),
          end_datetime:   aestToISO(bEditDate, bEditEnd),
          reason: bEditReason || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setBEditError(d.error ?? "Failed to update");
        return;
      }
      setBlockDetailOpen(false);
      setBlockEditOpen(false);
      setSelectedBlock(null);
      fetchDay(selectedDate);
    } catch {
      setBEditError("An unexpected error occurred");
    } finally {
      setBEditSaving(false);
    }
  }

  async function handleBlockDelete() {
    if (!selectedBlock) return;
    if (!confirm("Delete this blocked period?")) return;
    setBDeleting(true);
    try {
      await fetch(`/api/admin/blocked-periods/${selectedBlock.id}`, { method: "DELETE" });
      setBlockDetailOpen(false);
      setBlockEditOpen(false);
      setSelectedBlock(null);
      fetchDay(selectedDate);
    } catch { /* ignore */ } finally {
      setBDeleting(false);
    }
  }

  // ── Now-line position ────────────────────────────────────────────────────

  const nowLine = selectedDate === today
    ? (() => {
        const { h, m } = aestHM(new Date().toISOString());
        const px = (h - DAY_START + m / 60) * HOUR_HEIGHT;
        return px >= 0 && px <= TOTAL_HOURS * HOUR_HEIGHT ? px : null;
      })()
    : null;

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col bg-[#f8f5f2]" style={{ height: "calc(100dvh - 56px)" }}>

      {/* ── Week strip ──────────────────────────────────────────────────── */}
      <div
        className="bg-white border-b border-[#e8e0d8] px-2 py-2 flex items-center gap-0.5 shrink-0"
        onTouchStart={handleWeekSwipeStart}
        onTouchEnd={handleWeekSwipeEnd}
      >
        <button
          onClick={() => navigate(-7)}
          className="p-2 text-[#9a8f87] hover:text-[#044e77] active:text-[#044e77] shrink-0"
          aria-label="Previous week"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex flex-1">
          {weekDates.map((date, i) => {
            const isToday    = date === today;
            const isSelected = date === selectedDate;
            const dayNum     = parseInt(date.split("-")[2]);
            return (
              <button
                key={date}
                onClick={() => selectDay(date)}
                className="flex flex-col items-center gap-0.5 flex-1 py-1 rounded-xl active:bg-[#f0ebe4] transition-colors"
              >
                <span className={`text-[10px] font-medium tracking-wide
                  ${isSelected ? "text-[#044e77]" : "text-[#c0b4ab]"}`}>
                  {DAY_LETTERS[i]}
                </span>
                <span className={`w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-medium transition-colors
                  ${isToday && isSelected ? "bg-[#044e77] text-white" :
                    isToday              ? "bg-[#e0edf5] text-[#044e77]" :
                    isSelected           ? "bg-[#f0ebe4] text-[#1a1a1a] ring-1 ring-[#c0b4ab]" :
                                           "text-[#5a504a]"}`}>
                  {dayNum}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => navigate(7)}
          className="p-2 text-[#9a8f87] hover:text-[#044e77] active:text-[#044e77] shrink-0"
          aria-label="Next week"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── Date heading ────────────────────────────────────────────────── */}
      <div className="px-4 py-2 shrink-0 flex items-center justify-between border-b border-[#ede8e2] bg-[#f8f5f2]">
        <span className="text-sm font-medium text-[#1a1a1a]">{fmtDateHeading(selectedDate)}</span>
        {loading && (
          <span className="text-xs text-[#c0b4ab]">Loading…</span>
        )}
        {!loading && (appointments.length > 0 || classSessions.length > 0) && (
          <span className="text-xs text-[#9a8f87]">
            {appointments.length > 0 && `${appointments.length} appointment${appointments.length !== 1 ? "s" : ""}`}
            {appointments.length > 0 && classSessions.length > 0 && " · "}
            {classSessions.length > 0 && `${classSessions.length} class${classSessions.length !== 1 ? "es" : ""}`}
          </span>
        )}
      </div>

      {/* ── Timeline ────────────────────────────────────────────────────── */}
      <div ref={timelineRef} className="flex-1 overflow-y-auto bg-white">
        <div style={{ height: TOTAL_HOURS * HOUR_HEIGHT, position: "relative" }} className="flex">

          {/* Hour label column */}
          <div className="w-11 shrink-0 relative select-none">
            {HOUR_MARKS.map(h => (
              <div
                key={h}
                style={{ top: (h - DAY_START) * HOUR_HEIGHT }}
                className="absolute left-0 right-0 flex justify-end pr-1.5"
              >
                <span className="text-[9px] leading-none text-[#c0b4ab] -translate-y-1.5">
                  {hourLabel(h)}
                </span>
              </div>
            ))}
          </div>

          {/* Events + grid */}
          <div className="flex-1 relative border-l border-[#f0ebe4]">

            {/* Hour grid lines */}
            {HOUR_MARKS.map(h => (
              <div
                key={h}
                style={{ top: (h - DAY_START) * HOUR_HEIGHT }}
                className="absolute left-0 right-0 border-t border-[#f0ebe4] pointer-events-none"
              />
            ))}

            {/* Half-hour dashed lines */}
            {HOUR_MARKS.slice(0, -1).map(h => (
              <div
                key={`${h}h`}
                style={{ top: (h - DAY_START + 0.5) * HOUR_HEIGHT }}
                className="absolute left-0 right-0 border-t border-dashed border-[#f5f0ec] pointer-events-none"
              />
            ))}

            {/* Now line */}
            {nowLine !== null && (
              <div
                style={{ top: nowLine }}
                className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
              >
                <div className="w-2 h-2 rounded-full bg-rose-400 -translate-x-1 shrink-0" />
                <div className="flex-1 border-t border-rose-400" />
              </div>
            )}

            {/* Blocked periods */}
            {blocked.map(bp => (
              <button
                key={bp.id}
                onClick={() => openBlockDetail(bp)}
                style={{ top: topPx(bp.start_datetime) + 1, height: heightPx(bp.start_datetime, bp.end_datetime) - 2, left: 3, right: 3 }}
                className="absolute rounded bg-[#f0ebe4] border border-[#ddd8d2] z-5 px-2 py-1 flex items-center w-[calc(100%-6px)] text-left active:opacity-70"
              >
                <span className="text-[10px] font-medium text-[#9a8f87] truncate">
                  🚫 {bp.reason || "Blocked"}
                </span>
              </button>
            ))}

            {/* Appointments */}
            {appointments.map(appt => {
              const t = topPx(appt.start_datetime);
              const h = heightPx(appt.start_datetime, appt.end_datetime);
              const name = appt.clients
                ? `${appt.clients.first_name} ${appt.clients.last_name}`
                : "Unknown";
              return (
                <button
                  key={appt.id}
                  onClick={() => openApptDetail(appt)}
                  style={{ top: t + 2, height: h - 4, left: 4, right: 4 }}
                  className={`absolute rounded-lg border-l-4 z-10 px-2 py-1 overflow-hidden text-left
                    w-[calc(100%-8px)] ${apptColors(appt.status)} active:opacity-70 transition-opacity`}
                >
                  <p className="text-[11px] font-semibold leading-tight truncate">{name}</p>
                  {h >= 38 && appt.services && (
                    <p className="text-[10px] leading-tight truncate opacity-80 mt-0.5">
                      {appt.services.name}
                    </p>
                  )}
                  {h >= 54 && (
                    <p className="text-[10px] leading-tight opacity-60 mt-0.5">
                      {fmtTime(appt.start_datetime)}
                    </p>
                  )}
                </button>
              );
            })}

            {/* Class sessions */}
            {classSessions.map(cs => {
              const endIso = new Date(
                new Date(cs.start_datetime).getTime() + cs.duration_minutes * 60_000,
              ).toISOString();
              const confirmedCount = cs.class_bookings.filter(b => b.status === "confirmed").length;
              return (
                <button
                  key={cs.id}
                  onClick={() => {
                    setSelectedClass(cs);
                    setClassDetailOpen(true);
                    setClassEditOpen(false);
                    setCsEditError(null);
                    setCsEditSaved(false);
                  }}
                  style={{ top: topPx(cs.start_datetime) + 2, height: heightPx(cs.start_datetime, endIso) - 4, left: 4, right: 4 }}
                  className={`absolute rounded-lg border-l-4 z-10 px-2 py-1 overflow-hidden text-left
                    w-[calc(100%-8px)] bg-amber-50 border-l-amber-400 text-amber-800
                    active:opacity-70 transition-opacity ${!cs.active ? "opacity-50" : ""}`}
                >
                  <p className="text-[11px] font-semibold leading-tight truncate">✦ {cs.title}</p>
                  <p className="text-[10px] leading-tight opacity-80 mt-0.5">
                    {confirmedCount}/{cs.capacity} · {fmtTime(cs.start_datetime)}
                  </p>
                </button>
              );
            })}

            {/* Empty state */}
            {!loading && appointments.length === 0 && blocked.length === 0 && classSessions.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                   style={{ top: (9 - DAY_START) * HOUR_HEIGHT }}>
                <span className="text-sm text-[#d0c8c0]">No appointments</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      <button
        onClick={() => { setFabOpen(true); setBlockSheet(false); setNewBookingSheet(false); setSaveError(null); }}
        className="fixed bottom-6 right-5 w-14 h-14 rounded-full bg-[#044e77] text-white
                   shadow-lg shadow-[#044e77]/30 flex items-center justify-center z-30
                   active:scale-95 transition-transform"
        aria-label="Add"
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* ── Bottom sheet backdrop ────────────────────────────────────────── */}
      {fabOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => { setFabOpen(false); setBlockSheet(false); setNewBookingSheet(false); setBlockConflict(null); }}
        />
      )}

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl
          transition-transform duration-300 ease-out
          ${fabOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-[#e0d8d0] rounded-full" />
        </div>

        {!blockSheet && !newBookingSheet ? (
          /* ── Option list ─────────────────────────────────────────────── */
          <div className="px-4 pt-2 pb-10">
            <h3 className="text-[15px] font-medium text-[#1a1a1a] mb-4">Quick actions</h3>

            <button
              onClick={() => {
                setBlockSheet(true);
                setBlockDate(selectedDate);
                setSaveError(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#f8f5f2]
                         hover:bg-[#f0ebe4] active:bg-[#e8e0d8] transition-colors mb-2"
            >
              <span className="text-2xl w-9 text-center">🚫</span>
              <div className="text-left">
                <p className="text-[14px] font-medium text-[#1a1a1a]">Block time</p>
                <p className="text-xs text-[#9a8f87] mt-0.5">Mark a period as unavailable</p>
              </div>
            </button>

            <button
              onClick={() => setNewBookingSheet(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#f8f5f2]
                         hover:bg-[#f0ebe4] active:bg-[#e8e0d8] transition-colors"
            >
              <span className="text-2xl w-9 text-center">📅</span>
              <div className="text-left">
                <p className="text-[14px] font-medium text-[#1a1a1a]">Add appointment</p>
                <p className="text-xs text-[#9a8f87] mt-0.5">Book a client & send payment link</p>
              </div>
            </button>
          </div>
        ) : blockSheet ? (
          /* ── Block time form ─────────────────────────────────────────── */
          <div className="px-4 pt-1 pb-10">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => { setBlockSheet(false); setSaveError(null); setBlockConflict(null); }}
                className="p-1.5 text-[#9a8f87] hover:text-[#044e77] active:text-[#044e77] -ml-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-[15px] font-medium text-[#1a1a1a]">Block time</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">Date</label>
                <input
                  type="date"
                  value={blockDate}
                  onChange={e => setBlockDate(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#7a6f68] block mb-1">Start</label>
                  <select
                    value={blockStart}
                    onChange={e => setBlockStart(e.target.value)}
                    className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                  >
                    {TIME_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#7a6f68] block mb-1">End</label>
                  <select
                    value={blockEnd}
                    onChange={e => setBlockEnd(e.target.value)}
                    className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                  >
                    {TIME_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {blockConflictChecking && (
                <p className="text-xs text-[#9a8f87] animate-pulse">Checking availability…</p>
              )}

              {blockConflict && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-xs text-amber-800 leading-snug">{blockConflict}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">
                  Reason <span className="text-[#b0a499] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value)}
                  placeholder="e.g. Lunch break, Personal"
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white
                             focus:outline-none focus:border-[#044e77] placeholder:text-[#c0b4ab]"
                />
              </div>
            </div>

            {saveError && (
              <p className="mt-2 text-xs text-red-600">{saveError}</p>
            )}

            <button
              onClick={handleBlockSave}
              disabled={saving || !blockDate}
              className="mt-4 w-full py-3.5 rounded-2xl bg-[#044e77] text-white text-[14px] font-medium
                         disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {saving ? "Saving…" : "Block this time"}
            </button>
          </div>
        ) : newBookingSheet ? (
          /* ── New booking form ────────────────────────────────────────── */
          <div className="px-4 pt-1 pb-10 overflow-y-auto max-h-[80dvh]">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setNewBookingSheet(false)}
                className="p-1.5 text-[#9a8f87] hover:text-[#044e77] active:text-[#044e77] -ml-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
            <NewBookingForm
              onClose={() => { setNewBookingSheet(false); setFabOpen(false); }}
              onCreated={() => fetchDay(selectedDate)}
            />
          </div>
        ) : null}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          Appointment detail / edit bottom sheet
          ════════════════════════════════════════════════════════════════════ */}

      {/* Backdrop */}
      {apptDetailOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => { setApptDetailOpen(false); setApptEditOpen(false); setSelectedAppt(null); setApptEditConflict(null); }}
        />
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl
          transition-transform duration-300 ease-out
          ${apptDetailOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-[#e0d8d0] rounded-full" />
        </div>

        {selectedAppt && !apptEditOpen && (
          /* ── Appointment detail view ─────────────────────────────────── */
          <div className="px-4 pt-1 pb-10 overflow-y-auto max-h-[70dvh]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="text-[15px] font-medium text-[#1a1a1a]">
                    {selectedAppt.clients
                      ? `${selectedAppt.clients.first_name} ${selectedAppt.clients.last_name}`
                      : "Unknown client"}
                  </p>
                  {selectedAppt.clients?.is_new_client && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold
                                     bg-[#fbb040] text-[#044e77] shrink-0">
                      New Client
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#9a8f87]">{selectedAppt.services?.name ?? "—"}</p>
                {selectedAppt.clients?.is_new_client && (
                  <p className="text-xs text-[#7a6f68] mt-0.5 italic">+15 min consultation allocated</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize
                ${selectedAppt.status === "confirmed"       ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  selectedAppt.status === "pending"         ? "bg-amber-50   text-amber-700   border-amber-200"   :
                  selectedAppt.status === "pending_payment" ? "bg-purple-50  text-purple-700  border-purple-200"  :
                  selectedAppt.status === "completed"       ? "bg-blue-50    text-blue-700    border-blue-200"    :
                                                              "bg-red-50     text-red-600     border-red-200"}`}>
                {selectedAppt.status.replace("_", " ")}
              </span>
            </div>

            <div className="space-y-2.5 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Date & time</span>
                <span className="text-[#1a1a1a] font-medium">{fmtTime(selectedAppt.start_datetime)}, {fmtDateHeading(toAESTDate(selectedAppt.start_datetime))}</span>
              </div>
              {selectedAppt.services && (
                <div className="flex justify-between">
                  <span className="text-[#9a8f87]">Duration</span>
                  <span className="text-[#1a1a1a]">{selectedAppt.services.duration_minutes} min</span>
                </div>
              )}
              {selectedAppt.notes && (
                <div className="flex justify-between gap-4">
                  <span className="text-[#9a8f87] shrink-0">Notes</span>
                  <span className="text-[#1a1a1a] text-right">{selectedAppt.notes}</span>
                </div>
              )}
            </div>

            {selectedAppt.status !== "cancelled" && (
              <button
                onClick={() => openApptEdit(selectedAppt)}
                className="w-full py-3.5 rounded-2xl bg-[#044e77] text-white text-[14px] font-medium
                           active:opacity-80 transition-opacity"
              >
                Edit appointment
              </button>
            )}
          </div>
        )}

        {selectedAppt && apptEditOpen && (
          /* ── Appointment edit form ───────────────────────────────────── */
          <div className="px-4 pt-1 pb-10 overflow-y-auto max-h-[80dvh]">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => { setApptEditOpen(false); setApptEditConflict(null); }}
                className="p-1.5 text-[#9a8f87] hover:text-[#044e77] active:text-[#044e77] -ml-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-[15px] font-medium text-[#1a1a1a]">Edit appointment</h3>
            </div>

            <div className="text-xs text-[#9a8f87] mb-4">
              {selectedAppt.clients?.first_name} {selectedAppt.clients?.last_name} · {selectedAppt.services?.name}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">Date</label>
                <input
                  type="date"
                  value={apptEditDate}
                  onChange={e => setApptEditDate(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">
                  Time (AEST)
                  {apptEditConflictChecking && <span className="text-[#c0b4ab] ml-1 animate-pulse">checking…</span>}
                </label>
                <select
                  value={apptEditTime}
                  onChange={e => setApptEditTime(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                >
                  {TIME_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {apptEditConflict && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-xs text-amber-800 leading-snug">{apptEditConflict}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">
                  Notes <span className="text-[#b0a499] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={apptEditNotes}
                  onChange={e => setApptEditNotes(e.target.value)}
                  placeholder="Any notes for this appointment"
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white
                             focus:outline-none focus:border-[#044e77] placeholder:text-[#c0b4ab]"
                />
              </div>
            </div>

            {apptEditError && (
              <p className="mt-2 text-xs text-red-600">{apptEditError}</p>
            )}

            <button
              onClick={handleApptEditSave}
              disabled={apptEditSaving || apptEditSaved || !apptEditDate || !apptEditTime}
              className="mt-4 w-full py-3.5 rounded-2xl bg-[#044e77] text-white text-[14px] font-medium
                         disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {apptEditSaved ? "✓ Saved!" : apptEditSaving ? "Saving…" : "Save changes & notify client"}
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          Blocked period detail / edit bottom sheet
          ════════════════════════════════════════════════════════════════════ */}

      {/* Backdrop */}
      {blockDetailOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => { setBlockDetailOpen(false); setBlockEditOpen(false); setSelectedBlock(null); setBEditConflict(null); }}
        />
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl
          transition-transform duration-300 ease-out
          ${blockDetailOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-[#e0d8d0] rounded-full" />
        </div>

        {selectedBlock && !blockEditOpen && (
          /* ── Blocked period detail ───────────────────────────────────── */
          <div className="px-4 pt-1 pb-10">
            <p className="text-[15px] font-medium text-[#1a1a1a] mb-4">
              🚫 {selectedBlock.reason || "Blocked time"}
            </p>

            <div className="space-y-2.5 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Date</span>
                <span className="text-[#1a1a1a] font-medium">{fmtDateHeading(toAESTDate(selectedBlock.start_datetime))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Start</span>
                <span className="text-[#1a1a1a]">{fmtTime(selectedBlock.start_datetime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">End</span>
                <span className="text-[#1a1a1a]">{fmtTime(selectedBlock.end_datetime)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => openBlockEdit(selectedBlock)}
                className="flex-1 py-3.5 rounded-2xl bg-[#044e77] text-white text-[14px] font-medium
                           active:opacity-80 transition-opacity"
              >
                Edit
              </button>
              <button
                onClick={handleBlockDelete}
                disabled={bDeleting}
                className="flex-1 py-3.5 rounded-2xl border border-red-200 text-red-600 text-[14px] font-medium
                           hover:bg-red-50 disabled:opacity-40 active:opacity-80 transition-opacity"
              >
                {bDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}

        {selectedBlock && blockEditOpen && (
          /* ── Blocked period edit form ────────────────────────────────── */
          <div className="px-4 pt-1 pb-10">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => { setBlockEditOpen(false); setBEditConflict(null); }}
                className="p-1.5 text-[#9a8f87] hover:text-[#044e77] active:text-[#044e77] -ml-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-[15px] font-medium text-[#1a1a1a]">Edit blocked period</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">Date</label>
                <input
                  type="date"
                  value={bEditDate}
                  onChange={e => setBEditDate(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#7a6f68] block mb-1">Start</label>
                  <select
                    value={bEditStart}
                    onChange={e => setBEditStart(e.target.value)}
                    className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                  >
                    {TIME_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#7a6f68] block mb-1">End</label>
                  <select
                    value={bEditEnd}
                    onChange={e => setBEditEnd(e.target.value)}
                    className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                  >
                    {TIME_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {bEditConflictChecking && (
                <p className="text-xs text-[#9a8f87] animate-pulse">Checking availability…</p>
              )}

              {bEditConflict && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-xs text-amber-800 leading-snug">{bEditConflict}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">
                  Reason <span className="text-[#b0a499] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={bEditReason}
                  onChange={e => setBEditReason(e.target.value)}
                  placeholder="e.g. Lunch break, Personal"
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white
                             focus:outline-none focus:border-[#044e77] placeholder:text-[#c0b4ab]"
                />
              </div>
            </div>

            {bEditError && (
              <p className="mt-2 text-xs text-red-600">{bEditError}</p>
            )}

            <button
              onClick={handleBlockEditSave}
              disabled={bEditSaving || !bEditDate}
              className="mt-4 w-full py-3.5 rounded-2xl bg-[#044e77] text-white text-[14px] font-medium
                         disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {bEditSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          Class session detail / edit bottom sheet
          ════════════════════════════════════════════════════════════════════ */}

      {/* Backdrop */}
      {classDetailOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => { setClassDetailOpen(false); setClassEditOpen(false); setSelectedClass(null); }}
        />
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl
          transition-transform duration-300 ease-out
          ${classDetailOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-[#e0d8d0] rounded-full" />
        </div>

        {selectedClass && !classEditOpen && (
          /* ── Class detail view ───────────────────────────────────────── */
          <div className="px-4 pt-1 pb-10 overflow-y-auto max-h-[75dvh]">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium
                                   bg-amber-100 text-amber-800 border border-amber-200">
                    Class
                  </span>
                </div>
                <p className="text-[15px] font-medium text-[#1a1a1a]">{selectedClass.title}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                selectedClass.active
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-600 border-red-200"
              }`}>
                {selectedClass.active ? "Scheduled" : "Cancelled"}
              </span>
            </div>

            <div className="space-y-2.5 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Date & time</span>
                <span className="text-[#1a1a1a] font-medium">
                  {fmtTime(selectedClass.start_datetime)}, {fmtDateHeading(toAESTDate(selectedClass.start_datetime))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Duration</span>
                <span className="text-[#1a1a1a]">{selectedClass.duration_minutes} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9a8f87]">Booked</span>
                <span className="text-[#1a1a1a]">
                  {selectedClass.class_bookings.filter(b => b.status === "confirmed").length} / {selectedClass.capacity}
                </span>
              </div>
              {selectedClass.description && (
                <div className="flex justify-between gap-4">
                  <span className="text-[#9a8f87] shrink-0">Description</span>
                  <span className="text-[#1a1a1a] text-right">{selectedClass.description}</span>
                </div>
              )}
            </div>

            {/* Client list */}
            {selectedClass.class_bookings.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-medium text-[#7a6f68] uppercase tracking-wider mb-2">Registered Clients</p>
                <div className="space-y-2">
                  {selectedClass.class_bookings.map(b => (
                    <div key={b.id} className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        b.status === "confirmed" ? "bg-emerald-500" : "bg-[#c0b4ab]"
                      }`} />
                      <span className="font-medium text-[#1a1a1a]">
                        {b.clients?.first_name} {b.clients?.last_name}
                      </span>
                      <span className={`text-xs capitalize ml-auto ${
                        b.status === "confirmed" ? "text-emerald-700" : "text-[#9a8f87]"
                      }`}>{b.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedClass.active && (
              <button
                onClick={() => {
                  // Pre-fill edit form fields
                  const d = new Date(selectedClass.start_datetime);
                  setCsEditDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(d));
                  const parts = new Intl.DateTimeFormat("en-AU", {
                    timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit", hour12: false,
                  }).formatToParts(d);
                  const rawH = parseInt(parts.find(p => p.type === "hour")?.value ?? "9");
                  const rawM = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
                  const h = rawH === 24 ? 0 : rawH;
                  const snappedM = rawM < 15 ? "00" : rawM < 45 ? "30" : "00";
                  const snappedH = rawM >= 45 ? h + 1 : h;
                  setCsEditTime(`${String(snappedH).padStart(2, "0")}:${snappedM}`);
                  setCsEditCapacity(String(selectedClass.capacity));
                  setCsEditDesc(selectedClass.description ?? "");
                  setCsEditError(null);
                  setCsEditSaved(false);
                  setClassEditOpen(true);
                }}
                className="w-full py-3.5 rounded-2xl bg-[#044e77] text-white text-[14px] font-medium
                           active:opacity-80 transition-opacity"
              >
                Edit session
              </button>
            )}
          </div>
        )}

        {selectedClass && classEditOpen && (
          /* ── Class session edit form ─────────────────────────────────── */
          <div className="px-4 pt-1 pb-10 overflow-y-auto max-h-[85dvh]">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => { setClassEditOpen(false); setCsEditError(null); }}
                className="p-1.5 text-[#9a8f87] hover:text-[#044e77] active:text-[#044e77] -ml-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-[15px] font-medium text-[#1a1a1a]">Edit session</h3>
            </div>

            <p className="text-xs text-[#9a8f87] mb-4">{selectedClass.title}</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">Date</label>
                <input
                  type="date"
                  value={csEditDate}
                  onChange={e => setCsEditDate(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">Time (AEST)</label>
                <select
                  value={csEditTime}
                  onChange={e => setCsEditTime(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                >
                  {TIME_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">Capacity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={csEditCapacity}
                  onChange={e => setCsEditCapacity(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#7a6f68] block mb-1">
                  Description <span className="text-[#b0a499] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={csEditDesc}
                  onChange={e => setCsEditDesc(e.target.value)}
                  placeholder="Optional description"
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] bg-white
                             focus:outline-none focus:border-[#044e77] placeholder:text-[#c0b4ab]"
                />
              </div>
            </div>

            {csEditError && (
              <p className="mt-2 text-xs text-red-600">{csEditError}</p>
            )}

            <button
              onClick={async () => {
                const cap = parseInt(csEditCapacity, 10);
                if (!cap || cap < 1) { setCsEditError("Capacity must be at least 1."); return; }
                if (!selectedClass) return;
                setCsEditSaving(true);
                setCsEditError(null);
                try {
                  const startISO = new Date(`${csEditDate}T${csEditTime}:00+10:00`).toISOString();
                  const res = await fetch(`/api/admin/classes/${selectedClass.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "edit",
                      start_datetime: startISO,
                      capacity: cap,
                      description: csEditDesc || null,
                    }),
                  });
                  if (!res.ok) {
                    const d = await res.json() as { error?: string };
                    setCsEditError(d.error ?? "Failed to update");
                    return;
                  }
                  setCsEditSaved(true);
                  fetchDay(selectedDate);
                  setTimeout(() => {
                    setClassDetailOpen(false);
                    setClassEditOpen(false);
                    setSelectedClass(null);
                    setCsEditSaved(false);
                  }, 1200);
                } catch {
                  setCsEditError("An unexpected error occurred");
                } finally {
                  setCsEditSaving(false);
                }
              }}
              disabled={csEditSaving || csEditSaved || !csEditDate}
              className="mt-4 w-full py-3.5 rounded-2xl bg-[#044e77] text-white text-[14px] font-medium
                         disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {csEditSaved ? "✓ Saved!" : csEditSaving ? "Saving…" : "Save changes"}
            </button>

            {/* Cancel session */}
            <button
              onClick={async () => {
                if (!selectedClass) return;
                const confirmedCount = selectedClass.class_bookings.filter(b => b.status === "confirmed").length;
                if (!confirm(`Cancel "${selectedClass.title}" and notify ${confirmedCount} client(s)?`)) return;
                setCsCancelling(true);
                try {
                  const res = await fetch(`/api/admin/classes/${selectedClass.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "cancel" }),
                  });
                  if (!res.ok) {
                    const d = await res.json() as { error?: string };
                    setCsEditError(d.error ?? "Failed to cancel session");
                    return;
                  }
                  fetchDay(selectedDate);
                  setClassDetailOpen(false);
                  setClassEditOpen(false);
                  setSelectedClass(null);
                } catch {
                  setCsEditError("An unexpected error occurred");
                } finally {
                  setCsCancelling(false);
                }
              }}
              disabled={csCancelling}
              className="mt-3 w-full py-3 rounded-2xl border border-red-200 text-red-600 text-[14px] font-medium
                         hover:bg-red-50 disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {csCancelling ? "Cancelling…" : "Cancel this session"}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
