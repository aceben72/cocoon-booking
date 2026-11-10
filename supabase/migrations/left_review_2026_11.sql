-- ============================================================
-- November 2026 — "Left a Google review" flag on clients
-- Run in Supabase SQL Editor BEFORE deploying the matching code
-- (admin client page, appointment lists and the phone calendar select
-- clients.left_review_at, so they error until this column exists).
-- ============================================================

-- Set when Amanda marks a client as having left a Google review (admin
-- toggle); cleared when she undoes it. The same toggle adds/removes the
-- Mailchimp tag "left-review", which the post-facial review-request
-- journey checks so reviewed clients don't get asked again.
-- No backfill: starts null for everyone.

alter table public.clients
  add column if not exists left_review_at timestamptz;
