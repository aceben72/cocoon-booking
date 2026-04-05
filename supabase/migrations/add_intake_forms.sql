-- Digital client intake form system
-- Run this in the Supabase SQL editor

-- 1. Add treatment_notes to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS treatment_notes TEXT;

-- 2. Create intake_forms table
CREATE TABLE IF NOT EXISTS intake_forms (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id       uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id            uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token                varchar(64) NOT NULL UNIQUE,
  expires_at           timestamptz NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'submitted', 'acknowledged')),
  responses            jsonb,
  client_signature     text,       -- base64 PNG data URL
  client_signed_at     timestamptz,
  consultant_signature text,       -- base64 PNG data URL
  consultant_signed_at timestamptz,
  submitted_at         timestamptz,
  created_at           timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS intake_forms_token_idx        ON intake_forms (token);
CREATE        INDEX IF NOT EXISTS intake_forms_appointment_idx  ON intake_forms (appointment_id);
CREATE        INDEX IF NOT EXISTS intake_forms_client_idx       ON intake_forms (client_id);
