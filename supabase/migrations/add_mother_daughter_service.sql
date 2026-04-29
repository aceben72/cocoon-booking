-- ============================================================
-- Mother & Daughter Make-Up Class — individual service
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Extend the category CHECK constraint to include mother-daughter.
--    Also adds treatment-plans and admin-only which were seeded directly
--    (no prior migration covers them). DROP is tolerant of missing constraint.
DO $$
BEGIN
  ALTER TABLE services DROP CONSTRAINT services_category_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE services
  ADD CONSTRAINT services_category_check
  CHECK (category IN (
    'brow-treatments',
    'facials',
    'led-light-treatments',
    'make-up',
    'treatment-plans',
    'admin-only',
    'mother-daughter'
  ));

-- 2. Insert the service.
--    duration_minutes = 120 (2 hours)
--    padding_minutes  = 30  (post-appointment buffer)
--    price_cents      = 17900 ($179 — full payment required, no deposit)
INSERT INTO services (category, name, duration_minutes, padding_minutes, price_cents, active)
VALUES ('mother-daughter', 'Mother Daughter Make-Up Class', 120, 30, 17900, true)
ON CONFLICT DO NOTHING;
