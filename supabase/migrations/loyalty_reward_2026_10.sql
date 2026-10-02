-- ============================================================
-- October 2026 — loyalty reward ($50 off the 4th facial) + Basic LED cash price
-- Run in Supabase SQL Editor BEFORE deploying the matching code
-- (POST /api/bookings writes appointments.loyalty_discount_cents).
-- ============================================================

-- Discounts are recorded separately:
--   discount_cents          coupon only (unchanged meaning)
--   loyalty_discount_cents  loyalty reward ($50 off the 4th facial)
--   (cash/PayID discount    added by a later migration)
--
-- A non-cancelled appointment with loyalty_discount_cents > 0 IS the reward
-- use: it marks the point the client's facial count resets from (see
-- lib/loyalty-rules.ts). Cancelling that appointment automatically gives the
-- reward back — no separate table to keep in sync.

alter table public.appointments
  add column if not exists loyalty_discount_cents integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_loyalty_discount_cents_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_loyalty_discount_cents_check check (loyalty_discount_cents >= 0);
  end if;
end $$;

-- Jacqui Helkin, Indulge Facial 24 Oct 2026: the $50 loyalty reward was entered
-- by hand into discount_cents (price $149, $50 deposit paid, balance $49).
-- Move it to the loyalty field. Guarded on the current values so it is
-- idempotent and won't touch the row if it's been edited since.
-- (Checked 2 Oct: no other appointment has a manual $50 in discount_cents —
-- the only other coupon-less discount row is a gift-card booking, untouched.)
update public.appointments
set loyalty_discount_cents = 5000,
    discount_cents = 0
where id = '360b4766-b99e-43d6-b7a3-76c507a114b5'
  and discount_cents = 5000
  and coupon_id is null
  and loyalty_discount_cents = 0;

-- Basic LED Treatment: no cash price any more (fully prepaid by card online).
update public.services
set cash_price_cents = null
where id = '1da95ba9-ac4a-4984-b8dd-03375aee1a7a';  -- Basic LED Treatment

-- Verify (read-only):
-- select id, discount_cents, loyalty_discount_cents, amount_cents, amount_paid_cents
--   from public.appointments where id = '360b4766-b99e-43d6-b7a3-76c507a114b5';
--   → discount_cents 0, loyalty_discount_cents 5000
-- select name, cash_price_cents from public.services where name = 'Basic LED Treatment';
--   → null
