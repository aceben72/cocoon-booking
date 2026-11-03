-- ============================================================
-- November 2026 — Private make-up lessons
-- Run in Supabase SQL Editor BEFORE deploying the matching code.
-- (POST /api/bookings looks services up BY NAME, so the new code can't take
-- lesson bookings until these names exist.)
-- ============================================================
--
-- 1. Rename "Personal Make Up Class" → "Private Make-Up Lesson"
--    (120 min, padding 30, $279 card / $271 cash).
-- 2. Rename "Mother Daughter Make-Up Class" → "Mother & Daughter Make-Up Class"
--    (150 min, padding 30, $349 / $339, category unchanged).
-- 3. Insert "Me & a Friend Make-Up Lesson" (make-up, 150 min, padding 30, $349 / $339).
-- 4. appointments.extra_daughters (0–2, Mother & Daughter only).
-- 5. appointment_attendees: one row per person on a lesson booking, with the
--    "What would you like to learn?" answer and (Me & a Friend) the friend's
--    optional contact details.
--
-- Renames are by id AND name, so past appointments stay linked through
-- appointments.service_id (FK to services.id) and simply show the new name.
-- Existing bookings keep their amount_cents snapshot.
--
-- Idempotent: every statement accepts the old or the already-new state.
-- Each service step fails loudly (and the whole script rolls back) unless it
-- matches exactly one row and that row ends up exactly as intended.

begin;

-- ── 1–3. Services ─────────────────────────────────────────────────────────
do $$
declare
  n integer;
begin
  -- 1. Private Make-Up Lesson
  update public.services
  set name = 'Private Make-Up Lesson', duration_minutes = 120, padding_minutes = 30,
      price_cents = 27900, cash_price_cents = 27100
  where id = '0f1260e8-9c01-4683-898c-a64fc65b9a81'
    and name in ('Personal Make Up Class', 'Private Make-Up Lesson')
    and category = 'make-up';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Private Make-Up Lesson: expected to update exactly 1 row, updated %', n;
  end if;

  -- 2. Mother & Daughter Make-Up Class
  update public.services
  set name = 'Mother & Daughter Make-Up Class', duration_minutes = 150, padding_minutes = 30,
      price_cents = 34900, cash_price_cents = 33900
  where id = '34e4b315-66c5-4c02-9d99-7f5c25045cc7'
    and name in ('Mother Daughter Make-Up Class', 'Mother & Daughter Make-Up Class')
    and category = 'mother-daughter';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Mother & Daughter Make-Up Class: expected to update exactly 1 row, updated %', n;
  end if;

  -- 3. Me & a Friend Make-Up Lesson (insert once)
  insert into public.services (category, name, duration_minutes, padding_minutes, price_cents, cash_price_cents, active)
  select 'make-up', 'Me & a Friend Make-Up Lesson', 150, 30, 34900, 33900, true
  where not exists (select 1 from public.services where name = 'Me & a Friend Make-Up Lesson');

  -- Every name the booking API looks up must now match exactly one row, as intended.
  select count(*) into n from public.services
  where name = 'Private Make-Up Lesson' and category = 'make-up'
    and duration_minutes = 120 and padding_minutes = 30 and price_cents = 27900 and cash_price_cents = 27100 and active;
  if n <> 1 or (select count(*) from public.services where name = 'Private Make-Up Lesson') <> 1 then
    raise exception 'Private Make-Up Lesson: expected exactly 1 matching row';
  end if;

  select count(*) into n from public.services
  where name = 'Mother & Daughter Make-Up Class' and category = 'mother-daughter'
    and duration_minutes = 150 and padding_minutes = 30 and price_cents = 34900 and cash_price_cents = 33900 and active;
  if n <> 1 or (select count(*) from public.services where name = 'Mother & Daughter Make-Up Class') <> 1 then
    raise exception 'Mother & Daughter Make-Up Class: expected exactly 1 matching row';
  end if;

  select count(*) into n from public.services
  where name = 'Me & a Friend Make-Up Lesson' and category = 'make-up'
    and duration_minutes = 150 and padding_minutes = 30 and price_cents = 34900 and cash_price_cents = 33900 and active;
  if n <> 1 or (select count(*) from public.services where name = 'Me & a Friend Make-Up Lesson') <> 1 then
    raise exception 'Me & a Friend Make-Up Lesson: expected exactly 1 matching row (an existing row with this name has different values?)';
  end if;

  -- The old names must be gone.
  select count(*) into n from public.services
  where name in ('Personal Make Up Class', 'Mother Daughter Make-Up Class');
  if n <> 0 then
    raise exception 'Old service names still present (% rows)', n;
  end if;
end $$;

-- ── 4. Extra daughters on the booking ────────────────────────────────────
-- Priced into amount_cents at booking ($99 card each); the Complete panel
-- uses this count to work out the cash discount ($3 more per extra daughter).
alter table public.appointments
  add column if not exists extra_daughters smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_extra_daughters_check') then
    alter table public.appointments
      add constraint appointments_extra_daughters_check check (extra_daughters between 0 and 2);
  end if;
end $$;

-- ── 5. People on a lesson booking ────────────────────────────────────────
-- Not client records: the friend and daughters never get a clients row or a
-- Mailchimp contact (Amanda adds the friend to Mailchimp by hand).
create table if not exists public.appointment_attendees (
  id               uuid primary key default uuid_generate_v4(),
  appointment_id   uuid not null references public.appointments(id) on delete cascade,
  role             text not null check (role in ('client', 'friend', 'mum', 'daughter', 'extra_daughter')),
  position         smallint not null default 1 check (position between 1 and 2),
  experience_level text check (experience_level in ('beginner', 'some_experience', 'confident')),
  name             text,
  email            text,
  mobile           text,
  created_at       timestamptz not null default now(),
  unique (appointment_id, role, position)
);

create index if not exists appointment_attendees_appointment_id_idx
  on public.appointment_attendees (appointment_id);

-- Server-side only (service role), like appointment_payments.
alter table public.appointment_attendees enable row level security;

commit;

-- Verify (read-only):
-- select id, category, name, duration_minutes, padding_minutes, price_cents, cash_price_cents, active
--   from public.services where category in ('make-up', 'mother-daughter') order by name;
-- select column_name, data_type, column_default from information_schema.columns
--   where table_name = 'appointments' and column_name = 'extra_daughters';
-- select count(*) from public.appointment_attendees;
