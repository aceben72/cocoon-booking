// Run: npm test
// The redemption RPC, run for real in an in-process Postgres (PGlite) — never
// against Supabase. Loads the actual migration SQL plus the payments trigger
// from appointment_payments_2026_10.sql on minimal copies of the tables.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, MIGRATIONS), "utf8");

// The live payments trigger, taken from its migration so the test can't drift from it.
function paymentsTriggerSql(): string {
  const sql = read("appointment_payments_2026_10.sql");
  const start = sql.indexOf("create or replace function public.sync_appointment_amount_paid()");
  const endMarker = "for each row execute function public.sync_appointment_amount_paid();";
  const end = sql.indexOf(endMarker);
  assert.ok(start > 0 && end > start, "payments trigger not found in appointment_payments_2026_10.sql");
  return sql.slice(start, end + endMarker.length);
}

const SCHEMA = `
  create role anon; create role authenticated;
  create table public.gift_cards (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    initial_value_cents integer not null check (initial_value_cents > 0),
    remaining_value_cents integer not null check (remaining_value_cents >= 0),
    is_active boolean not null default true,
    check (remaining_value_cents <= initial_value_cents)
  );
  create table public.appointments (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'confirmed',
    amount_cents integer not null,
    discount_cents integer not null default 0,
    loyalty_discount_cents integer not null default 0,
    cash_discount_cents integer not null default 0,
    amount_paid_cents integer not null default 0,
    gift_card_id uuid references public.gift_cards(id)
  );
  create table public.gift_card_redemptions (
    id uuid primary key default gen_random_uuid(),
    gift_card_id uuid not null references public.gift_cards(id),
    appointment_id uuid not null references public.appointments(id),
    amount_cents integer not null check (amount_cents > 0),
    redeemed_at timestamptz not null default now()
  );
  create table public.appointment_payments (
    id uuid primary key default gen_random_uuid(),
    appointment_id uuid not null references public.appointments(id),
    amount_cents integer not null check (amount_cents > 0),
    method text not null check (method in ('card_square','cash','payid_bank','gift_card','facial_package','unknown')),
    paid_at timestamptz not null default now(),
    square_payment_id text null,
    recorded_by text null,
    notes text null,
    created_at timestamptz not null default now()
  );
`;

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(paymentsTriggerSql());
  await db.exec(read("admin_gift_card_deposit_2026_11.sql"));
});

async function card(code: string, cents: number, active = true): Promise<string> {
  const r = await db.query<{ id: string }>(
    "insert into gift_cards (code, initial_value_cents, remaining_value_cents, is_active) values ($1, $2, $2, $3) returning id",
    [code, cents, active],
  );
  return r.rows[0].id;
}

async function appt(amountCents: number, status = "confirmed"): Promise<string> {
  const r = await db.query<{ id: string }>("insert into appointments (amount_cents, status) values ($1, $2) returning id", [amountCents, status]);
  return r.rows[0].id;
}

interface Call {
  appointmentId: string;
  expectedPaid?: number | null;
  complete?: boolean;
  cashDiscount?: number | null;
  code?: string | null;
  giftCents?: number;
  method?: string | null;
  amount?: number;
}

async function record(c: Call) {
  const r = await db.query<{ r: { amount_paid_cents: number; status: string; gift_card: { remaining_value_cents: number; code: string } | null } }>(
    "select public.record_appointment_payments($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as r",
    [
      c.appointmentId, c.expectedPaid ?? null, c.complete ?? false, c.cashDiscount ?? null, null,
      c.code ?? null, c.giftCents ?? 0, c.method ?? null, c.amount ?? 0, "admin", null,
    ],
  );
  return r.rows[0].r;
}

async function state(apptId: string, cardId: string) {
  const a = (await db.query<{ amount_paid_cents: number; status: string; gift_card_id: string | null; cash_discount_cents: number }>(
    "select amount_paid_cents, status, gift_card_id, cash_discount_cents from appointments where id = $1", [apptId])).rows[0];
  const g = (await db.query<{ remaining_value_cents: number; is_active: boolean }>(
    "select remaining_value_cents, is_active from gift_cards where id = $1", [cardId])).rows[0];
  const payments = (await db.query<{ method: string; amount_cents: number; recorded_by: string; notes: string | null }>(
    "select method, amount_cents, recorded_by, notes from appointment_payments where appointment_id = $1 order by created_at, method", [apptId])).rows;
  const redemptions = (await db.query<{ amount_cents: number }>(
    "select amount_cents from gift_card_redemptions where appointment_id = $1", [apptId])).rows;
  return { a, g, payments, redemptions };
}

async function rejects(p: Promise<unknown>, message: RegExp, code = "22023") {
  await assert.rejects(p, (err: { message: string; code: string }) => {
    assert.match(err.message, message);
    assert.equal(err.code, code);
    return true;
  });
}

test("partial use: $100 card, $50 used → $50 left, redemption + gift_card payment row, gift_card_id set", async () => {
  const cardId = await card("GIFT-AAAA-BBBB", 10000);
  const a = await appt(15400);
  // Lower case and spaces, as typed in the studio
  const r = await record({ appointmentId: a, expectedPaid: 0, code: " gift-aaaa-bbbb ", giftCents: 5000 });
  assert.equal(r.gift_card?.remaining_value_cents, 5000);
  assert.equal(r.amount_paid_cents, 5000);

  const s = await state(a, cardId);
  assert.equal(s.a.amount_paid_cents, 5000);           // trigger, never written directly
  assert.equal(s.a.gift_card_id, cardId);
  assert.equal(s.g.remaining_value_cents, 5000);
  assert.equal(s.g.is_active, true);
  assert.deepEqual(s.redemptions, [{ amount_cents: 5000 }]);
  assert.deepEqual(s.payments, [{ method: "gift_card", amount_cents: 5000, recorded_by: "admin", notes: "GIFT-AAAA-BBBB" }]);
});

test("exact to zero: card used down to $0 stays is_active, then is refused as having no balance", async () => {
  const cardId = await card("GIFT-ZERO-0001", 15400);
  const a = await appt(15400);
  await record({ appointmentId: a, expectedPaid: 0, code: "GIFT-ZERO-0001", giftCents: 15400 });
  const s = await state(a, cardId);
  assert.equal(s.g.remaining_value_cents, 0);
  assert.equal(s.g.is_active, true);   // "used up" = balance 0; is_active is left for Amanda's toggle
  assert.equal(s.a.amount_paid_cents, 15400);

  const b = await appt(15400);
  await rejects(record({ appointmentId: b, expectedPaid: 0, code: "GIFT-ZERO-0001", giftCents: 100 }), /no balance left/);
});

test("inactive, unknown, over-balance and over-owing cards are refused with nothing written", async () => {
  const offId = await card("GIFT-OFF0-0001", 10000, false);
  await card("GIFT-SMAL-0001", 3000);
  const a = await appt(15400);

  await rejects(record({ appointmentId: a, expectedPaid: 0, code: "GIFT-OFF0-0001", giftCents: 5000 }), /deactivated/);
  await rejects(record({ appointmentId: a, expectedPaid: 0, code: "GIFT-NOPE-0000", giftCents: 5000 }), /not found/);
  await rejects(record({ appointmentId: a, expectedPaid: 0, code: "GIFT-SMAL-0001", giftCents: 5000 }), /only has \$30\.00 left/);

  const big = await card("GIFT-BIGG-0001", 50000);
  await rejects(record({ appointmentId: a, expectedPaid: 0, code: "GIFT-BIGG-0001", giftCents: 20000 }), /more than the \$154\.00 owing/);

  const s = await state(a, offId);
  assert.equal(s.a.amount_paid_cents, 0);
  assert.deepEqual(s.payments, []);
  assert.deepEqual(s.redemptions, []);
  assert.equal(s.g.remaining_value_cents, 10000);
  assert.equal((await state(a, big)).g.remaining_value_cents, 50000);
});

test("split payment at Complete: $100 gift card + $49 cash with $5 cash discount, one transaction", async () => {
  const cardId = await card("GIFT-6A8L-TEST", 10000);
  const a = await appt(15400, "pending_payment");
  const r = await record({
    appointmentId: a, expectedPaid: 0, complete: true, cashDiscount: 500,
    code: "GIFT-6A8L-TEST", giftCents: 10000, method: "cash", amount: 4900,
  });
  assert.equal(r.status, "completed");
  const s = await state(a, cardId);
  assert.equal(s.a.amount_paid_cents, 14900);
  assert.equal(s.a.cash_discount_cents, 500);
  assert.equal(s.g.remaining_value_cents, 0);
  assert.deepEqual(s.payments.map((p) => [p.method, p.amount_cents]).sort(), [["cash", 4900], ["gift_card", 10000]]);
});

test("a failed step rolls back the gift card part too (bad remainder method)", async () => {
  const cardId = await card("GIFT-ROLL-BACK", 10000);
  const a = await appt(15400);
  await rejects(
    record({ appointmentId: a, expectedPaid: 0, complete: true, code: "GIFT-ROLL-BACK", giftCents: 10000, method: "bitcoin", amount: 5400 }),
    /Invalid payment method/,
  );
  const s = await state(a, cardId);
  assert.equal(s.g.remaining_value_cents, 10000);
  assert.deepEqual(s.redemptions, []);
  assert.equal(s.a.status, "confirmed");
});

test("deposit on a pending_payment booking (no completion) moves it to confirmed", async () => {
  const cardId = await card("GIFT-PEND-0001", 10000);
  const a = await appt(15400, "pending_payment");
  const r = await record({ appointmentId: a, expectedPaid: 0, method: "card_square", amount: 5000 });
  assert.equal(r.status, "confirmed");
  assert.equal(r.amount_paid_cents, 5000);
  const b = await appt(15400, "pending_payment");
  assert.equal((await record({ appointmentId: b, expectedPaid: 0, code: "GIFT-PEND-0001", giftCents: 10000 })).status, "confirmed");
  assert.equal((await state(b, cardId)).g.remaining_value_cents, 0);
});

test("two tabs, one card: the second redemption sees the first and is refused", async () => {
  // PGlite is a single connection, so the two tabs run one after the other
  // here; in Postgres the card row lock (FOR UPDATE) makes concurrent calls
  // queue the same way, so the second always reads the decremented balance.
  const cardId = await card("GIFT-TWO0-TABS", 10000);
  const a1 = await appt(15400);
  const a2 = await appt(15400);
  await record({ appointmentId: a1, expectedPaid: 0, code: "GIFT-TWO0-TABS", giftCents: 10000 });
  await rejects(record({ appointmentId: a2, expectedPaid: 0, code: "GIFT-TWO0-TABS", giftCents: 10000 }), /no balance left/);
  assert.equal((await state(a2, cardId)).a.amount_paid_cents, 0);
  assert.equal((await state(a1, cardId)).g.remaining_value_cents, 0);
});

test("two tabs, one appointment: the stale tab gets 40001 and nothing is redeemed twice", async () => {
  const cardId = await card("GIFT-SAME-APPT", 20000);
  const a = await appt(15400);
  // Both tabs opened the panel when $0 was paid.
  await record({ appointmentId: a, expectedPaid: 0, complete: true, code: "GIFT-SAME-APPT", giftCents: 15400 });
  await rejects(
    record({ appointmentId: a, expectedPaid: 0, complete: true, code: "GIFT-SAME-APPT", giftCents: 15400 }),
    /changed — refresh/,
    "40001",
  );
  const s = await state(a, cardId);
  assert.equal(s.g.remaining_value_cents, 4600);
  assert.equal(s.redemptions.length, 1);
});

test("both functions lock rows and are not callable by anon/authenticated", async () => {
  const src = read("admin_gift_card_deposit_2026_11.sql");
  assert.match(src, /from public\.gift_cards where code = v_code for update/);
  assert.match(src, /from public\.appointments where id = p_appointment_id for update/);
  for (const fn of ["_apply_gift_card_redemption(uuid,text,integer,text)", "record_appointment_payments(uuid,integer,boolean,integer,integer,text,integer,text,integer,text,text)"]) {
    for (const role of ["anon", "authenticated"]) {
      const r = await db.query<{ ok: boolean }>(`select has_function_privilege('${role}', 'public.${fn}', 'execute') as ok`);
      assert.equal(r.rows[0].ok, false, `${role} can execute ${fn}`);
    }
  }
});
