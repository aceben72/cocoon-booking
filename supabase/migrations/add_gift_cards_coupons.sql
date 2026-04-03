-- ============================================================
-- Cocoon Skin & Beauty — Gift Cards & Discount Coupons
-- Run in Supabase SQL Editor
-- ============================================================

-- ─── Gift Cards ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gift_cards (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                  TEXT NOT NULL UNIQUE,
  initial_value_cents   INTEGER NOT NULL CHECK (initial_value_cents > 0),
  remaining_value_cents INTEGER NOT NULL CHECK (remaining_value_cents >= 0),
  purchaser_email       TEXT,
  recipient_name        TEXT,
  recipient_email       TEXT,
  note                  TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (remaining_value_cents <= initial_value_cents)
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards (code);

-- ─── Coupons ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value       NUMERIC NOT NULL CHECK (value > 0),
  -- For percentage: value is 1–100. For fixed: value is cents.
  max_uses    INTEGER CHECK (max_uses > 0), -- NULL = unlimited
  uses_count  INTEGER NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  valid_from  DATE,
  valid_until DATE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  applies_to  TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'specific_categories')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons (code);

-- ─── Coupon Category Restrictions ─────────────────────────────
-- Only populated when coupons.applies_to = 'specific_categories'
CREATE TABLE IF NOT EXISTS coupon_category_restrictions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id  UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN ('brow-treatments','facials','led-light-treatments','make-up'))
);

-- ─── Coupon Uses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupon_uses (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id      UUID NOT NULL REFERENCES coupons(id),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  discount_cents INTEGER NOT NULL CHECK (discount_cents > 0),
  used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Gift Card Redemptions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS gift_card_redemptions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_card_id   UUID NOT NULL REFERENCES gift_cards(id),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Extend Appointments ──────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS discount_cents  INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  ADD COLUMN IF NOT EXISTS coupon_id       UUID REFERENCES coupons(id),
  ADD COLUMN IF NOT EXISTS gift_card_id    UUID REFERENCES gift_cards(id);

-- Allow amount_paid_cents = 0 (fully covered by gift card / coupon)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_amount_paid_cents_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_amount_paid_cents_check
  CHECK (amount_paid_cents >= 0);
