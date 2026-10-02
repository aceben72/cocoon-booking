-- ============================================================
-- October 2026 — record HOW appointments are paid (cash / PayID / card / gift card)
-- Run in Supabase SQL Editor BEFORE deploying the matching code.
-- Runs as one transaction: if the backfill check at the end fails, nothing is applied.
-- ============================================================
begin;

-- ── 1. Payments table ────────────────────────────────────────────────────────
-- One row per payment received against an appointment. Methods:
--   card_square     Square — online checkout, payment link, or the studio terminal
--   cash            cash in studio
--   payid_bank      PayID / bank transfer / direct deposit
--   gift_card       gift card redeemed (income was recognised when the card was sold)
--   facial_package  facial package redeemed (income recognised when the package was sold)
--   unknown         backfill only — paid before this table existed and the method
--                   can't be proven; Amanda reclassifies these in Admin → Payments
create table if not exists public.appointment_payments (
  id                uuid primary key default gen_random_uuid(),
  appointment_id    uuid not null references public.appointments(id),
  amount_cents      integer not null check (amount_cents > 0),
  method            text not null check (method in ('card_square','cash','payid_bank','gift_card','facial_package','unknown')),
  paid_at           timestamptz not null default now(),
  square_payment_id text null,
  recorded_by       text null,   -- online | payment_link | admin | backfill
  notes             text null,
  created_at        timestamptz not null default now()
);

create index if not exists appointment_payments_appointment_id_idx on public.appointment_payments (appointment_id);
create index if not exists appointment_payments_paid_at_idx on public.appointment_payments (paid_at);

-- Same as every other private table: RLS on, no policies → service role only.
alter table public.appointment_payments enable row level security;

-- ── 2. appointments.amount_paid_cents = sum of payments (trigger-maintained) ──
-- Kept as a stored column (not derived on read) because a dozen existing read
-- paths — admin views, emails, confirmation screens — already read it. The
-- trigger makes appointment_payments the source of truth: any insert/update/
-- delete of a payment recomputes the total. App code no longer writes
-- amount_paid_cents directly except as the initial value on insert.
create or replace function public.sync_appointment_amount_paid()
returns trigger
language plpgsql
as $$
declare
  v_ids uuid[];
begin
  if tg_op = 'INSERT' then
    v_ids := array[new.appointment_id];
  elsif tg_op = 'DELETE' then
    v_ids := array[old.appointment_id];
  else
    v_ids := array[new.appointment_id, old.appointment_id];
  end if;

  update public.appointments a
  set amount_paid_cents = coalesce(
    (select sum(p.amount_cents) from public.appointment_payments p where p.appointment_id = a.id), 0)
  where a.id = any(v_ids);

  return null;
end $$;

drop trigger if exists appointment_payments_sync_amount_paid on public.appointment_payments;
create trigger appointment_payments_sync_amount_paid
  after insert or update or delete on public.appointment_payments
  for each row execute function public.sync_appointment_amount_paid();

-- ── 3. Cash / PayID discount ─────────────────────────────────────────────────
alter table public.appointments
  add column if not exists cash_discount_cents integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_cash_discount_cents_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_cash_discount_cents_check check (cash_discount_cents >= 0);
  end if;
end $$;

-- ── 4. Complete / record payment — one transaction ───────────────────────────
-- Called by POST /api/admin/appointments/[id]/payment after lib/complete-payment.ts
-- has worked out the discounts and amount. Locks the row and refuses if the
-- amount paid changed since the panel was opened (double tap / two devices).
create or replace function public.record_appointment_payment(
  p_appointment_id        uuid,
  p_expected_paid_cents   integer,
  p_cash_discount_cents   integer,
  p_loyalty_discount_cents integer,
  p_method                text,
  p_amount_cents          integer,
  p_recorded_by           text,
  p_notes                 text
) returns void
language plpgsql
as $$
declare
  v_status text;
  v_paid   integer;
begin
  select status, amount_paid_cents into v_status, v_paid
  from public.appointments where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment not found';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Appointment is cancelled';
  end if;
  if v_paid <> p_expected_paid_cents then
    raise exception 'Payments on this appointment changed — refresh and try again' using errcode = '40001';
  end if;

  update public.appointments
  set cash_discount_cents    = p_cash_discount_cents,
      loyalty_discount_cents = p_loyalty_discount_cents,
      status                 = 'completed'
  where id = p_appointment_id;

  if p_amount_cents > 0 then
    insert into public.appointment_payments (appointment_id, amount_cents, method, recorded_by, notes)
    values (p_appointment_id, p_amount_cents, p_method, p_recorded_by, p_notes);
  end if;
end $$;

-- Functions in public are callable by anon through the API by default — lock it down.
revoke execute on function public.record_appointment_payment(uuid, integer, integer, integer, text, integer, text, text) from public, anon, authenticated;
revoke execute on function public.sync_appointment_amount_paid() from public, anon, authenticated;

-- ── 5. Payment owing ─────────────────────────────────────────────────────────
-- Completed appointments with a balance after every discount and payment.
-- Admin → Payments uses the same rule; a daily checklist outside this repo
-- can select from this view. security_invoker keeps RLS (service role only).
create or replace view public.appointments_payment_owing
with (security_invoker = true) as
select
  a.id, a.client_id, a.service_id, a.start_datetime,
  a.amount_cents, a.discount_cents, a.loyalty_discount_cents, a.cash_discount_cents, a.amount_paid_cents,
  a.amount_cents - a.discount_cents - a.loyalty_discount_cents - a.cash_discount_cents - a.amount_paid_cents as balance_cents
from public.appointments a
where a.status = 'completed'
  and a.amount_cents - a.discount_cents - a.loyalty_discount_cents - a.cash_discount_cents - a.amount_paid_cents > 0;

-- ── 6. Backfill: one payment row per appointment already showing money paid ──
-- amount_paid_cents must come out unchanged for every appointment — checked below.
create temp table _paid_before on commit drop as
  select id, amount_paid_cents from public.appointments;

-- 6a. Known by hand (Ben, 2 Oct 2026)
--   Kate Thorn Leissring 2 Oct: $149 cash on the day.
--   Jacqui Helkin 1 Aug: $50 online deposit (Square) + $99 balance, method not known.
--   Jacqui Helkin 24 Oct: $50 deposit paid in studio at her 12 Sep visit, method not known.
--   (Jacqui 20 Jun and 12 Sep fall through to 'unknown' in 6d.)
insert into public.appointment_payments (appointment_id, amount_cents, method, paid_at, square_payment_id, recorded_by, notes)
select v.appointment_id, v.amount_cents, v.method, v.paid_at, v.square_payment_id, 'backfill', v.notes
from (values
  ('a1c76344-cff5-47b0-a7f3-97bb2e5e5fc2'::uuid, 14900, 'cash',        '2026-10-02 02:00:00+00'::timestamptz, null::text, 'Paid in full in cash on the day (recorded by hand 2 Oct)'),
  ('d3a90d2e-bf6b-4aa7-acd6-02f0c9f318c9'::uuid,  5000, 'card_square', '2026-06-20 01:22:57+00'::timestamptz, 'pYCYGlo4xTtwj5P7XBfL3dZQiLQZY', 'Online deposit'),
  ('d3a90d2e-bf6b-4aa7-acd6-02f0c9f318c9'::uuid,  9900, 'unknown',     '2026-08-01 00:00:00+00'::timestamptz, null::text, 'Balance on the day — method not recorded'),
  ('360b4766-b99e-43d6-b7a3-76c507a114b5'::uuid,  5000, 'unknown',     '2026-09-12 00:00:00+00'::timestamptz, null::text, 'Deposit paid in studio at 12 Sep visit — method not recorded')
) as v(appointment_id, amount_cents, method, paid_at, square_payment_id, notes)
join public.appointments a on a.id = v.appointment_id
where not exists (select 1 from public.appointment_payments p where p.appointment_id = v.appointment_id);

-- Everything else: appointments with money paid and no payment rows yet.
create temp table _todo on commit drop as
select
  a.id, a.amount_paid_cents, a.square_payment_id, a.created_at, a.start_datetime,
  coalesce(g.gc_cents, 0) as gc_cents, g.redeemed_at,
  exists (select 1 from public.facial_package_redemptions r where r.appointment_id = a.id) as pkg
from public.appointments a
left join (
  select appointment_id, sum(amount_cents) as gc_cents, min(redeemed_at) as redeemed_at
  from public.gift_card_redemptions group by appointment_id
) g on g.appointment_id = a.id
where a.amount_paid_cents > 0
  and not exists (select 1 from public.appointment_payments p where p.appointment_id = a.id);

-- 6b. Gift card part (from gift_card_redemptions)
insert into public.appointment_payments (appointment_id, amount_cents, method, paid_at, recorded_by, notes)
select id, least(gc_cents, amount_paid_cents), 'gift_card', redeemed_at, 'backfill', 'Gift card redemption'
from _todo where gc_cents > 0;

-- 6c. Facial package redemptions
insert into public.appointment_payments (appointment_id, amount_cents, method, paid_at, recorded_by, notes)
select id, amount_paid_cents - gc_cents, 'facial_package', start_datetime, 'backfill', 'Facial package redemption'
from _todo where pkg and amount_paid_cents > gc_cents;

-- 6d. The rest: Square if there's a Square payment id (charged at booking), otherwise unknown
insert into public.appointment_payments (appointment_id, amount_cents, method, paid_at, square_payment_id, recorded_by, notes)
select
  id,
  amount_paid_cents - gc_cents,
  case when square_payment_id is not null then 'card_square' else 'unknown' end,
  case when square_payment_id is not null then created_at else least(start_datetime, now()) end,
  square_payment_id,
  'backfill',
  case when square_payment_id is not null then 'Charged by Square at booking' else 'Method not recorded — please confirm' end
from _todo where not pkg and amount_paid_cents > gc_cents;

-- 6e. Check: every appointment's amount_paid_cents is exactly what it was.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.appointments a join _paid_before b on b.id = a.id
  where a.amount_paid_cents <> b.amount_paid_cents;
  if v_bad > 0 then
    raise exception 'Backfill changed amount_paid_cents on % appointment(s) — rolled back', v_bad;
  end if;
end $$;

commit;

-- Verify (read-only):
-- select method, count(*), sum(amount_cents) from public.appointment_payments group by method order by method;
-- select count(*) from public.appointments_payment_owing;
