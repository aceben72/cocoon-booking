-- Migration: add amount_paid_cents to appointments
-- Run this in the Supabase SQL editor if the table already exists.
-- amount_paid_cents = what was charged at booking (deposit or full)
-- amount_cents      = total service price (already exists)

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS amount_paid_cents INTEGER
    CHECK (amount_paid_cents > 0);

-- Back-fill existing rows: assume full payment was taken
UPDATE appointments
  SET amount_paid_cents = amount_cents
  WHERE amount_paid_cents IS NULL;

-- Now make it NOT NULL
ALTER TABLE appointments
  ALTER COLUMN amount_paid_cents SET NOT NULL;
