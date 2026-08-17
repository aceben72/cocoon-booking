-- ============================================================
-- Professional Make-Up Application — extend duration by 15 min
-- Run in Supabase SQL Editor
-- ============================================================

-- Duration-only change: 60 -> 75 minutes. Price and padding untouched.
-- The DB "services" row is not read by booking/availability logic
-- (lib/services-data.ts is the source of truth there) but IS joined
-- into admin appointment/calendar views for display
-- (app/admin/MobileCalendar.tsx, app/admin/appointments/AppointmentTable.tsx),
-- so it needs to stay in sync with lib/services-data.ts.

UPDATE services
SET duration_minutes = 75
WHERE name = 'Professional Make-Up Application'
  AND duration_minutes = 60;
