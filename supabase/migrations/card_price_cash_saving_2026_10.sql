-- ============================================================
-- 1 October 2026 price change — card surcharge folded into price
-- Run in Supabase SQL Editor BEFORE deploying the matching code.
-- ============================================================

-- Card surcharges are banned in Australia from 1 Oct 2026, so the card fee
-- moves into the service price. price_cents becomes the card price (old
-- price + 3%, rounded up to the whole dollar; Agebiotic set to $999).
-- cash_price_cents holds the old price, which clients still pay by cash,
-- PayID or bank transfer. NULL cash_price_cents means "no cash saving".
--
-- Each UPDATE is guarded on the old (or already-new) price, so the script
-- is idempotent and won't clobber a manual edit made in the meantime.
--
-- Existing bookings are unaffected: appointments.amount_cents and
-- class_bookings.amount_cents are per-booking snapshots.
--
-- Deliberately NOT touched:
--   - Treatment Plan Facial (284376cf-…, admin-only, $0)
--   - Group class prices (lib/class-types.ts) — on hold

alter table public.services
  add column if not exists cash_price_cents integer null;

-- Facials
update public.services set price_cents = 10200, cash_price_cents = 9900  where id = '729e9c21-5596-4dcf-93f3-582d1607a17f' and price_cents in (9900, 10200);  -- Basic Facial
update public.services set price_cents = 15400, cash_price_cents = 14900 where id = '82488878-f180-4de6-a257-3ab6c8e83893' and price_cents in (14900, 15400); -- Indulge Facial
update public.services set price_cents = 20500, cash_price_cents = 19900 where id = '0e83c613-14e1-4b7e-886f-e7c4553f161c' and price_cents in (19900, 20500); -- Opulence Facial

-- LED
update public.services set price_cents = 4700,  cash_price_cents = 4500  where id = '1da95ba9-ac4a-4984-b8dd-03375aee1a7a' and price_cents in (4500, 4700);   -- Basic LED Treatment
update public.services set price_cents = 6100,  cash_price_cents = 5900  where id = 'b0eeb66e-bcd9-4787-aefb-f7088139df45' and price_cents in (5900, 6100);   -- Deluxe LED Treatment

-- Treatment plans
update public.services set price_cents = 92100, cash_price_cents = 89400 where id = 'a8938403-b47e-4652-a4b8-6405cad112a5' and price_cents in (89400, 92100); -- Purity Herbal Peeling System
update public.services set price_cents = 99900, cash_price_cents = 97400 where id = '19152b07-1bfb-449f-95c2-f5b73f439ff0' and price_cents in (97400, 99900); -- Agebiotic System

-- Brows
update public.services set price_cents = 2600,  cash_price_cents = 2500  where id = 'ce9718bc-046b-4cd0-b43e-21a0e0740501' and price_cents in (2500, 2600);   -- Brow Wax
update public.services set price_cents = 3100,  cash_price_cents = 3000  where id = '6b3c24b0-d7a3-47f7-9bec-2ad2c39a1572' and price_cents in (3000, 3100);   -- Brow Hybrid Dye
update public.services set price_cents = 4700,  cash_price_cents = 4500  where id = 'd48fbea0-edd1-4d97-8368-704446898de4' and price_cents in (4500, 4700);   -- Brow Hybrid Dye & Wax
update public.services set price_cents = 6700,  cash_price_cents = 6500  where id = '9acc03db-eac9-4acc-b792-dd78a4eadfbc' and price_cents in (6500, 6700);   -- Brow Lamination
update public.services set price_cents = 8300,  cash_price_cents = 8000  where id = 'be7b5baf-bdcc-4e31-9f04-f97bb98c0ece' and price_cents in (8000, 8300);   -- Brow Lamination & Dye
update public.services set price_cents = 9800,  cash_price_cents = 9500  where id = '4e1edc79-9f99-45b4-b1ff-247dfe5983e3' and price_cents in (9500, 9800);   -- Brow Lamination, Dye & Wax

-- Make-up
update public.services set price_cents = 13400, cash_price_cents = 13000 where id = '1137bc93-611f-47a5-b9d6-f597b94c5233' and price_cents in (13000, 13400); -- Professional Make-Up Application
update public.services set price_cents = 16400, cash_price_cents = 15900 where id = '0f1260e8-9c01-4683-898c-a64fc65b9a81' and price_cents in (15900, 16400); -- Personal Make Up Class
update public.services set price_cents = 18500, cash_price_cents = 17900 where id = '34e4b315-66c5-4c02-9d99-7f5c25045cc7' and price_cents in (17900, 18500); -- Mother Daughter Make-Up Class

-- Verify (read-only): expect 16 rows with cash_price_cents set
-- select name, price_cents, cash_price_cents from public.services order by name;
