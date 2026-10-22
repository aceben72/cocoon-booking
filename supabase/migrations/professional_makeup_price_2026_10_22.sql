-- ============================================================
-- 22 October 2026 — Professional Make-Up Application price change
-- Run in Supabase SQL Editor BEFORE deploying the matching code.
-- ============================================================

-- $134 card / $130 cash → $139 card / $135 cash, PayID or direct deposit.
-- Matched on the exact name POST /api/bookings looks up (lib/services-data.ts);
-- the name itself is not changed.
--
-- Idempotent: the update only touches the row while it is at the old price
-- (or already at the new one). Fails loudly — and rolls back — unless exactly
-- one row has this name and it ends up at the new price.
--
-- Existing bookings are unaffected: appointments.amount_cents is a per-booking
-- snapshot. The Complete panel keeps the $4 cash discount for bookings made at
-- $134 (lib/complete-payment.ts, EARLIER_CARD_PRICES).

do $$
declare
  n_rows integer;
  n_ok   integer;
begin
  select count(*) into n_rows
  from public.services
  where name = 'Professional Make-Up Application';

  if n_rows <> 1 then
    raise exception 'Expected exactly 1 services row named ''Professional Make-Up Application'', found %', n_rows;
  end if;

  update public.services
  set price_cents = 13900, cash_price_cents = 13500
  where name = 'Professional Make-Up Application'
    and price_cents in (13400, 13900);

  select count(*) into n_ok
  from public.services
  where name = 'Professional Make-Up Application'
    and price_cents = 13900
    and cash_price_cents = 13500;

  if n_ok <> 1 then
    raise exception 'Professional Make-Up Application was not at $134 or $139 — left unchanged; check the row manually';
  end if;
end $$;

-- Verify (read-only): expect 13900 / 13500
-- select id, name, price_cents, cash_price_cents from public.services where name = 'Professional Make-Up Application';
