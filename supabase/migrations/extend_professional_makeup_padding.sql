-- ============================================================
-- Professional Make-Up Application — extend padding by 15 min
-- Run in Supabase SQL Editor
-- ============================================================

-- Padding-only change: 30 -> 45 minutes. Duration (75 min) and price
-- ($130) untouched. The DB "services" row is not read by booking/
-- availability logic (lib/services-data.ts is the source of truth there)
-- but IS joined into admin appointment/calendar views for display
-- (app/admin/MobileCalendar.tsx, app/admin/appointments/AppointmentTable.tsx),
-- so it needs to stay in sync with lib/services-data.ts.
--
-- Note: this does NOT retroactively extend end_datetime on already-booked
-- future appointments for this service — end_datetime is frozen at booking
-- time. The booking-conflict check (lib/booking-conflicts.ts) recomputes
-- each existing appointment's effective end from the service's current
-- duration_minutes + padding_minutes at validation time, so new bookings
-- are still correctly blocked even though older rows' stored end_datetime
-- is unchanged. Do not bulk-UPDATE existing appointment rows here — that
-- would be a live write to real booking data and needs Ben's explicit
-- sign-off first, per CLAUDE.md.

UPDATE services
SET padding_minutes = 45
WHERE name = 'Professional Make-Up Application'
  AND padding_minutes = 30;
