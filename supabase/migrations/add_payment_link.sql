-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- 1. Add payment link columns to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_link_token          UUID        UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_link_token_expires_at TIMESTAMPTZ       DEFAULT NULL;

-- 2. Extend the status check constraint to include pending_payment
--    (Drop the old constraint first; it may not exist — errors are suppressed.)
DO $$
BEGIN
  ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'pending_payment'));

-- 3. Allow amount_paid_cents = 0 (needed for pending_payment bookings where
--    payment hasn't occurred yet; the existing constraint requires > 0).
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_amount_paid_cents_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_amount_paid_cents_check
  CHECK (amount_paid_cents >= 0);
