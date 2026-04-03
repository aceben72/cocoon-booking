-- ============================================================
-- Make-Up Classes — class_sessions + class_bookings tables
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS class_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type       TEXT NOT NULL CHECK (class_type IN ('masterclass', 'mother_daughter')),
  title            TEXT NOT NULL,
  start_datetime   TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 180,
  capacity         INTEGER NOT NULL DEFAULT 4,
  description      TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_sessions_start ON class_sessions (start_datetime);

CREATE TABLE IF NOT EXISTS class_bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES class_sessions(id),
  client_id         UUID NOT NULL REFERENCES clients(id),
  status            TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed', 'cancelled')),
  square_payment_id TEXT,
  amount_cents      INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_bookings_session ON class_bookings (session_id);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_class_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER class_bookings_updated_at
  BEFORE UPDATE ON class_bookings
  FOR EACH ROW EXECUTE FUNCTION update_class_bookings_updated_at();

-- View: sessions with spots_remaining calculated
CREATE OR REPLACE VIEW class_sessions_with_availability AS
SELECT
  cs.*,
  cs.capacity - COUNT(cb.id) FILTER (WHERE cb.status = 'confirmed') AS spots_remaining
FROM class_sessions cs
LEFT JOIN class_bookings cb ON cb.session_id = cs.id
GROUP BY cs.id;

-- RLS
ALTER TABLE class_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_bookings  ENABLE ROW LEVEL SECURITY;

-- Public can read active upcoming sessions (needed for booking flow)
CREATE POLICY "public_read_class_sessions"
  ON class_sessions FOR SELECT TO anon USING (active = TRUE);

-- Bookings created/read via service role only
