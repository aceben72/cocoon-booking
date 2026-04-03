-- ============================================================
-- Gift Cards — public purchase flow columns
-- Run in Supabase SQL Editor after add_gift_cards_coupons.sql
-- ============================================================

-- Personal message from purchaser to recipient
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS personal_message TEXT;

-- Track whether card was issued by admin or purchased by a customer
ALTER TABLE gift_cards
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin'
    CHECK (source IN ('admin', 'customer'));

-- purchaser_name stored separately (admin flow uses purchaser_email only)
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS purchaser_name TEXT;
