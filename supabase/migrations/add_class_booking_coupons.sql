-- ============================================================
-- Cocoon Skin & Beauty — Coupon support for class ticket bookings
-- Run in Supabase SQL Editor
-- ============================================================

-- ─── Extend Class Bookings ─────────────────────────────────────
ALTER TABLE class_bookings
  ADD COLUMN IF NOT EXISTS coupon_id      UUID REFERENCES coupons(id),
  ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0);

-- ─── Extend Coupon Uses ────────────────────────────────────────
-- A coupon_uses row now traces back to either an appointment or a
-- class_booking (never both, never neither).
ALTER TABLE coupon_uses
  ADD COLUMN IF NOT EXISTS class_booking_id UUID REFERENCES class_bookings(id);

ALTER TABLE coupon_uses ALTER COLUMN appointment_id DROP NOT NULL;

ALTER TABLE coupon_uses DROP CONSTRAINT IF EXISTS coupon_uses_exactly_one_target;
ALTER TABLE coupon_uses ADD CONSTRAINT coupon_uses_exactly_one_target CHECK (
  (appointment_id IS NOT NULL)::int + (class_booking_id IS NOT NULL)::int = 1
);
