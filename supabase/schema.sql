-- ============================================================
-- Cocoon Skin & Beauty — Booking App Database Schema
-- Run in Supabase SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Services ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category         TEXT NOT NULL CHECK (category IN ('brow-treatments','facials','led-light-treatments','make-up')),
  name             TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  padding_minutes  INTEGER NOT NULL DEFAULT 30 CHECK (padding_minutes >= 0),
  price_cents      INTEGER NOT NULL CHECK (price_cents > 0),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Availability Rules ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS availability_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (day_of_week)
);

-- ─── Blocked Periods ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_periods (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime   TIMESTAMPTZ NOT NULL,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_datetime > start_datetime)
);

CREATE INDEX IF NOT EXISTS idx_blocked_periods_range ON blocked_periods (start_datetime, end_datetime);

-- ─── Clients ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  mobile        TEXT NOT NULL,
  is_new_client BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (email);

-- ─── Appointments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id        UUID NOT NULL REFERENCES services(id),
  client_id         UUID NOT NULL REFERENCES clients(id),
  start_datetime    TIMESTAMPTZ NOT NULL,
  end_datetime      TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('pending','confirmed','completed','cancelled')),
  square_payment_id TEXT,
  amount_cents      INTEGER NOT NULL CHECK (amount_cents > 0),
  amount_paid_cents INTEGER NOT NULL CHECK (amount_paid_cents > 0),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_datetime > start_datetime)
);

CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments (start_datetime);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments (status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Seed: Default Availability Rules ────────────────────────
INSERT INTO availability_rules (day_of_week, open_time, close_time, is_closed) VALUES
  (0, '10:00', '16:00', FALSE), -- Sunday
  (1, '10:00', '17:30', TRUE),  -- Monday (closed)
  (2, '10:00', '17:30', TRUE),  -- Tuesday (closed)
  (3, '10:00', '17:30', TRUE),  -- Wednesday (closed)
  (4, '10:00', '17:30', FALSE), -- Thursday
  (5, '10:00', '17:30', FALSE), -- Friday
  (6, '10:00', '16:30', FALSE)  -- Saturday
ON CONFLICT (day_of_week) DO NOTHING;

-- ─── Seed: Services ──────────────────────────────────────────
INSERT INTO services (id, category, name, duration_minutes, padding_minutes, price_cents) VALUES
  -- Brow Treatments
  (uuid_generate_v4(), 'brow-treatments', 'Brow Wax',                      30, 30,  2500),
  (uuid_generate_v4(), 'brow-treatments', 'Brow Hybrid Dye',                30, 30,  3000),
  (uuid_generate_v4(), 'brow-treatments', 'Brow Lamination',                35, 30,  6500),
  (uuid_generate_v4(), 'brow-treatments', 'Brow Hybrid Dye & Wax',          40, 30,  4500),
  (uuid_generate_v4(), 'brow-treatments', 'Brow Lamination & Dye',          45, 30,  8000),
  (uuid_generate_v4(), 'brow-treatments', 'Brow Lamination, Dye & Wax',     60, 30,  9500),
  -- Facials
  (uuid_generate_v4(), 'facials',         'Basic Facial',                   45, 30,  9900),
  (uuid_generate_v4(), 'facials',         'Indulge Facial',                 60, 30, 14900),
  (uuid_generate_v4(), 'facials',         'Opulence Facial',                80, 30, 19900),
  -- LED Light Treatments
  (uuid_generate_v4(), 'led-light-treatments', 'Basic LED Treatment',       35, 30,  4500),
  (uuid_generate_v4(), 'led-light-treatments', 'Deluxe LED Treatment',      40, 30,  5900),
  -- Make-Up
  (uuid_generate_v4(), 'make-up', 'Professional Make-Up Application',       60, 30, 13000),
  (uuid_generate_v4(), 'make-up', 'Personal Make Up Class',                 90, 30, 15900)
ON CONFLICT DO NOTHING;

-- ─── Row Level Security ───────────────────────────────────────
ALTER TABLE services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_periods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments       ENABLE ROW LEVEL SECURITY;

-- Public can read services and availability (needed for booking flow)
CREATE POLICY "public_read_services"
  ON services FOR SELECT TO anon USING (active = TRUE);

CREATE POLICY "public_read_availability"
  ON availability_rules FOR SELECT TO anon USING (TRUE);

CREATE POLICY "public_read_blocked_periods"
  ON blocked_periods FOR SELECT TO anon USING (TRUE);

-- Clients and appointments are created via service role only (API routes)
-- Admin access via service role key (bypasses RLS)
