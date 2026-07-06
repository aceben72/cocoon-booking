-- ============================================================
-- Advanced Techniques Makeup Class — new class_sessions.class_type
-- Run in Supabase SQL Editor
--
-- Splits the old $89 "Make-Up Class" (class_type = 'masterclass') into two
-- bookable classes:
--   - masterclass     (unchanged type value) -> "Everyday Essentials Makeup Class", $79, 120 min
--   - advanced_class   (new)                  -> "Advanced Techniques Makeup Class",  $135, 150 min
-- mother_daughter is unaffected. Price/duration/labels live in lib/class-types.ts,
-- not in the DB — this migration only widens the allowed class_type values.
-- ============================================================

DO $$
BEGIN
  ALTER TABLE class_sessions DROP CONSTRAINT class_sessions_class_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_class_type_check
  CHECK (class_type IN ('masterclass', 'advanced_class', 'mother_daughter'));
