-- ============================================================
-- November 2026 — admin "Deposit paid" + "Gift card" payments
-- Run in Supabase SQL Editor BEFORE deploying the matching code.
-- Adds functions only: no table changes, no data changes. Safe to re-run.
-- The existing record_appointment_payment() is left in place (the code
-- deployed before this change still calls it).
-- ============================================================
begin;

-- ── 1. Gift card redemption — internal, one card against one appointment ─────
-- The caller must already hold the appointment row lock (FOR UPDATE).
-- Lock order everywhere: appointment first, then gift card, so two tabs
-- redeeming the same card against different appointments queue on the card
-- row and can never deadlock.
--
-- A card used down to $0 stays is_active = true (same as online redemptions
-- today). "Used up" is remaining_value_cents = 0; is_active = false means
-- Amanda deactivated it by hand. Validation rejects both.
create or replace function public._apply_gift_card_redemption(
  p_appointment_id uuid,
  p_code           text,
  p_amount_cents   integer,
  p_recorded_by    text
) returns jsonb
language plpgsql
as $$
declare
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_card   public.gift_cards%rowtype;
  v_appt   public.appointments%rowtype;
  v_owing  integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Gift card amount must be more than $0' using errcode = '22023';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Appointment not found' using errcode = '22023';
  end if;
  if v_appt.status = 'cancelled' then
    raise exception 'Appointment is cancelled' using errcode = '22023';
  end if;

  select * into v_card from public.gift_cards where code = v_code for update;
  if not found then
    raise exception 'Gift card % not found', v_code using errcode = '22023';
  end if;
  if not v_card.is_active then
    raise exception 'Gift card % has been deactivated', v_code using errcode = '22023';
  end if;
  if v_card.remaining_value_cents <= 0 then
    raise exception 'Gift card % has no balance left', v_code using errcode = '22023';
  end if;
  if p_amount_cents > v_card.remaining_value_cents then
    raise exception 'Gift card % only has $% left', v_code, trim(to_char(v_card.remaining_value_cents / 100.0, 'FM999990.00'))
      using errcode = '22023';
  end if;

  v_owing := v_appt.amount_cents - v_appt.discount_cents - v_appt.loyalty_discount_cents
           - v_appt.cash_discount_cents - v_appt.amount_paid_cents;
  if p_amount_cents > v_owing then
    raise exception 'That is more than the $% owing on this appointment', trim(to_char(greatest(v_owing, 0) / 100.0, 'FM999990.00'))
      using errcode = '22023';
  end if;

  update public.gift_cards
  set remaining_value_cents = remaining_value_cents - p_amount_cents
  where id = v_card.id;

  insert into public.gift_card_redemptions (gift_card_id, appointment_id, amount_cents)
  values (v_card.id, p_appointment_id, p_amount_cents);

  update public.appointments
  set gift_card_id = coalesce(gift_card_id, v_card.id)
  where id = p_appointment_id;

  -- Trigger brings amount_paid_cents up to date.
  insert into public.appointment_payments (appointment_id, amount_cents, method, recorded_by, notes)
  values (p_appointment_id, p_amount_cents, 'gift_card', p_recorded_by, v_code);

  return jsonb_build_object(
    'gift_card_id', v_card.id,
    'code', v_code,
    'amount_cents', p_amount_cents,
    'remaining_value_cents', v_card.remaining_value_cents - p_amount_cents
  );
end $$;

-- ── 2. Record payments on an appointment — one transaction ──────────────────
-- Used by:
--   • Complete panel (p_complete = true): sets the cash/loyalty discounts,
--     redeems an optional gift card, records the remainder in one method,
--     sets status = completed. Superset of record_appointment_payment().
--   • Payments taken before the appointment (p_complete = false): admin
--     "Deposit paid" / "Gift card" bookings, gift card at online checkout,
--     a deposit added to an existing booking. Discounts are not touched; a
--     pending_payment booking becomes confirmed (it's now paid towards).
-- p_expected_paid_cents: optimistic lock on amount_paid_cents (double tap /
-- two devices). Pass null to skip it (a booking that was created a moment
-- ago in the same request).
create or replace function public.record_appointment_payments(
  p_appointment_id         uuid,
  p_expected_paid_cents    integer,
  p_complete               boolean,
  p_cash_discount_cents    integer,
  p_loyalty_discount_cents integer,
  p_gift_card_code         text,
  p_gift_card_amount_cents integer,
  p_method                 text,
  p_amount_cents           integer,
  p_recorded_by            text,
  p_notes                  text
) returns jsonb
language plpgsql
as $$
declare
  v_status text;
  v_paid   integer;
  v_gift   jsonb := null;
begin
  select status, amount_paid_cents into v_status, v_paid
  from public.appointments where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment not found' using errcode = '22023';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Appointment is cancelled' using errcode = '22023';
  end if;
  if p_expected_paid_cents is not null and v_paid <> p_expected_paid_cents then
    raise exception 'Payments on this appointment changed — refresh and try again' using errcode = '40001';
  end if;
  if coalesce(p_amount_cents, 0) < 0 then
    raise exception 'Amount can''t be negative' using errcode = '22023';
  end if;
  if coalesce(p_amount_cents, 0) > 0
     and p_method not in ('card_square', 'cash', 'payid_bank') then
    raise exception 'Invalid payment method %', p_method using errcode = '22023';
  end if;

  -- Discounts first, so the gift card's "not more than owing" check sees them.
  if p_complete then
    update public.appointments
    set cash_discount_cents    = coalesce(p_cash_discount_cents, cash_discount_cents),
        loyalty_discount_cents = coalesce(p_loyalty_discount_cents, loyalty_discount_cents)
    where id = p_appointment_id;
  end if;

  if coalesce(p_gift_card_amount_cents, 0) > 0 then
    v_gift := public._apply_gift_card_redemption(p_appointment_id, p_gift_card_code, p_gift_card_amount_cents, p_recorded_by);
  end if;

  if coalesce(p_amount_cents, 0) > 0 then
    insert into public.appointment_payments (appointment_id, amount_cents, method, recorded_by, notes)
    values (p_appointment_id, p_amount_cents, p_method, p_recorded_by, p_notes);
  end if;

  if p_complete then
    update public.appointments set status = 'completed' where id = p_appointment_id;
  elsif v_status = 'pending_payment'
        and (coalesce(p_amount_cents, 0) > 0 or coalesce(p_gift_card_amount_cents, 0) > 0) then
    update public.appointments set status = 'confirmed' where id = p_appointment_id;
  end if;

  return jsonb_build_object(
    'gift_card', v_gift,
    'amount_paid_cents', (select amount_paid_cents from public.appointments where id = p_appointment_id),
    'status', (select status from public.appointments where id = p_appointment_id)
  );
end $$;

-- Functions in public are callable by anon through the API by default — lock them down.
revoke execute on function public._apply_gift_card_redemption(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.record_appointment_payments(uuid, integer, boolean, integer, integer, text, integer, text, integer, text, text) from public, anon, authenticated;

commit;

-- Verify (read-only):
-- select proname from pg_proc where proname in ('_apply_gift_card_redemption', 'record_appointment_payments');
