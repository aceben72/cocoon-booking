// Run: npm test
// Duplicate-client rules, run for real in an in-process Postgres (PGlite) —
// never against Supabase. Loads supabase/migrations/client_dedupe_2026_11.sql
// on minimal copies of clients and the tables that point at it.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { normaliseMobile, normaliseAuMobile } from "./utils.ts";
import { emailTakenMessage, mailchimpEmailFor, publicBookingClient } from "./client-lookup.ts";
import { defaultMergeEmail, describeMergeMoves, oldEmailWarnings } from "./client-merge.ts";

const MIGRATION = readFileSync(new URL("../supabase/migrations/client_dedupe_2026_11.sql", import.meta.url), "utf8");

const SCHEMA = `
  create role anon; create role authenticated;
  create table public.clients (
    id uuid primary key default gen_random_uuid(),
    first_name text not null,
    last_name text not null,
    email text not null,
    mobile text,
    is_new_client boolean not null default false,
    notes text,
    created_at timestamptz not null default now(),
    exclude_from_loyalty boolean not null default false,
    left_review_at timestamptz
  );
  create table public.appointments (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id),
    start_datetime timestamptz not null default now() - interval '7 days',
    status text not null default 'confirmed',
    created_at timestamptz not null default now()
  );
  create table public.class_sessions (
    id uuid primary key default gen_random_uuid(),
    start_datetime timestamptz not null default now() - interval '3 days'
  );
  create table public.class_bookings (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.class_sessions(id),
    client_id uuid not null references public.clients(id),
    status text not null default 'confirmed',
    created_at timestamptz not null default now()
  );
  create table public.intake_forms (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id) on delete cascade
  );
`;

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(MIGRATION);
});

async function client(first: string, last: string, email: string, mobile: string | null, extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ["first_name", "last_name", "email", "mobile", ...Object.keys(extra)];
  const vals = [first, last, email, mobile, ...Object.values(extra)];
  const r = await db.query<{ id: string }>(
    `insert into clients (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    vals,
  );
  return r.rows[0].id;
}

type Found = { client_id: string; matched_by: string; stored_email: string };
async function findOrCreate(first: string, last: string, email: string, mobile: string | null, opts: { isNew?: boolean; notes?: string; refresh?: boolean } = {}): Promise<Found> {
  const r = await db.query<Found>(
    "select * from find_or_create_client($1, $2, $3, $4, $5, $6, $7)",
    [first, last, email, mobile, opts.isNew ?? false, opts.notes ?? null, opts.refresh ?? false],
  );
  return r.rows[0];
}

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number }>(sql, params)).rows[0].n);
const clientCount = () => count("select count(*)::int as n from clients");
const row = async (id: string) =>
  (await db.query<Record<string, unknown>>("select * from clients where id = $1", [id])).rows[0];

// ── Mobile normalisation ─────────────────────────────────────────────────────

const MOBILE_CASES: Array<[string, string | null]> = [
  ["0438 222 499", "+61438222499"],
  ["0438222499", "+61438222499"],
  ["+61438222499", "+61438222499"],
  ["61438222499", "+61438222499"],
  ["+61 0438 222 499", "+61438222499"],
  ["(0438) 222-499", "+61438222499"],
  ["0438-222-499", "+61438222499"],
  ["438 222 499", "+61438222499"],
  ["  +61 438 222 499  ", "+61438222499"],
  ["07 3123 4567", "+61731234567"],
  ["+44 7700 900123", "+447700900123"],
  ["1 (555) 010-9999", "15550109999"],
  ["", null],
  ["   ", null],
];

test("normaliseMobile: every AU format → +61…, overseas kept as digits (and leading +)", () => {
  for (const [raw, want] of MOBILE_CASES) assert.equal(normaliseMobile(raw), want, raw);
  assert.equal(normaliseMobile(null), null);
});

test("normalise_mobile() in SQL agrees with normaliseMobile() in TS", async () => {
  for (const [raw, want] of MOBILE_CASES) {
    const r = await db.query<{ m: string | null }>("select normalise_mobile($1) as m", [raw]);
    assert.equal(r.rows[0].m, want, raw);
  }
});

test("normaliseAuMobile: only Australian numbers pass booking validation", () => {
  assert.equal(normaliseAuMobile("0438 222 499"), "+61438222499");
  assert.equal(normaliseAuMobile("+44 7700 900123"), null);
  assert.equal(normaliseAuMobile("041234567"), null);
  assert.equal(normaliseAuMobile(""), null);
});

// ── findOrCreateClient rules ─────────────────────────────────────────────────

test("email match: different case and spaces find the same client", async () => {
  const id = await client("Lesley", "Dyer", "lesleydyer@outlook.com", "+61400000001");
  const r = await findOrCreate("Lesley", "Dyer", "  LesleyDyer@Outlook.COM ", "0400 000 001");
  assert.equal(r.client_id, id);
  assert.equal(r.matched_by, "email");
  assert.equal(await clientCount(), 1);
});

test("email match beats a different mobile", async () => {
  const id = await client("Jane", "Smith", "jane@example.com", "+61400000001");
  const r = await findOrCreate("Jane", "Smith", "jane@example.com", "0499 999 999");
  assert.equal(r.client_id, id);
  assert.equal(r.matched_by, "email");
});

test("mobile + first name: links to the one client, keeps her email, notes the new one", async () => {
  const id = await client("Rebecca", "McLeod", "r.mcleod1983@outlook.com", "+61438222499", { notes: "Prefers Saturdays" });
  const r = await findOrCreate(" rebecca ", "Mcleod", "Holdenfan_05@Hotmail.com", "0438 222 499");
  assert.equal(r.client_id, id);
  assert.equal(r.matched_by, "mobile_name");
  assert.equal(r.stored_email, "r.mcleod1983@outlook.com");
  assert.equal(await clientCount(), 1);
  const c = await row(id);
  assert.equal(c.email, "r.mcleod1983@outlook.com", "stored email not overwritten");
  assert.match(String(c.notes), /^Prefers Saturdays\nAlso booked with holdenfan_05@hotmail\.com on \d{1,2} \w{3} \d{4}$/);

  // Booking again with the same new email doesn't repeat the note.
  await findOrCreate("Rebecca", "Mcleod", "holdenfan_05@hotmail.com", "+61438222499");
  assert.equal((String((await row(id)).notes).match(/Also booked with/g) ?? []).length, 1);
});

test("shared mobile, different first names (the Laceys): no match, new client", async () => {
  await client("Emma", "Lacey", "emma@example.com", "+61424184946");
  const r = await findOrCreate("Brock", "Lacey", "brock@example.com", "0424 184 946");
  assert.equal(r.matched_by, "created");
  assert.equal(await clientCount(), 2);
});

test("two clients match mobile + first name: no guess, new client created", async () => {
  await client("Irene", "?", "irene.placeholder@cocoonskinandbeauty.com.au", "+61411111111");
  await client("Irene", "Till", "irene@example.com", "+61411111111");
  const r = await findOrCreate("Irene", "Till", "irene.new@example.com", "0411 111 111");
  assert.equal(r.matched_by, "created");
  assert.equal(await clientCount(), 3);
  const m = await db.query<{ matched_by: string; candidates: number }>("select * from find_client_match('irene.other@example.com', 'Irene', '0411111111')");
  assert.deepEqual(m.rows.map((x) => [x.matched_by, x.candidates]), [["ambiguous", 3]], "the two originals plus the one just created");
});

test("placeholder emails are never matched on", async () => {
  await client("Jo", "Bloggs", "nomail@cocoonskinandbeauty.com.au", "+61400000002");
  // Same placeholder, different person (different name and mobile): new client.
  const r = await findOrCreate("Sam", "Other", "NoMail@CocoonSkinAndBeauty.com.au", "0400 000 003");
  assert.equal(r.matched_by, "created");
  assert.equal(await clientCount(), 2);
  // A placeholder typed at booking doesn't get noted as "also booked with".
  const r2 = await findOrCreate("Jo", "Bloggs", "other@cocoonskinandbeauty.com.au", "0400 000 002");
  assert.equal(r2.matched_by, "mobile_name");
  const notes = (await db.query<{ notes: string | null }>("select notes from clients where id = $1", [r2.client_id])).rows[0].notes;
  assert.equal(notes, null);
});

test("no match creates a client (trimmed, lower-cased email, normalised mobile)", async () => {
  const r = await findOrCreate(" Ann ", " Lee ", " Ann.Lee@Example.com ", "0412 345 678", { isNew: true, notes: "Sensitive skin" });
  assert.equal(r.matched_by, "created");
  const c = await row(r.client_id);
  assert.equal(c.first_name, "Ann");
  assert.equal(c.email, "ann.lee@example.com");
  assert.equal(c.mobile, "+61412345678");
  assert.equal(c.is_new_client, true);
  assert.equal(c.notes, "Sensitive skin");
});

test("public email match refreshes name/mobile and adds notes without wiping earlier ones", async () => {
  const id = await client("Kim", "Old", "kim@example.com", "+61400000004", { notes: "Merged from Kim K kim2@example.com on 1 Nov 2026" });
  await findOrCreate("Kim", "New", "kim@example.com", "0400 000 005", { refresh: true, notes: "Running late" });
  let c = await row(id);
  assert.equal(c.last_name, "New");
  assert.equal(c.mobile, "+61400000005");
  assert.equal(c.notes, "Merged from Kim K kim2@example.com on 1 Nov 2026\nRunning late");
  await findOrCreate("Kim", "New", "kim@example.com", "0400 000 005", { refresh: true });
  c = await row(id);
  assert.equal(c.notes, "Merged from Kim K kim2@example.com on 1 Nov 2026\nRunning late", "blank notes leave notes alone");
});

test("double submit / race: a unique violation re-runs the lookup and uses the existing client", async () => {
  const id = await client("Pat", "Race", "pat@example.com", "+61400000006");
  // Simulate the other request saving between our lookup and our insert:
  // make the lookup miss once, so the insert hits the unique index.
  await db.exec(`
    alter function find_client_match(text, text, text) rename to find_client_match_real;
    create function find_client_match(p_email text, p_first_name text, p_mobile text)
    returns table (client_id uuid, matched_by text, stored_email text, candidates integer)
    language sql as $$ select null::uuid, null::text, null::text, 0 where false $$;
  `);
  const r = await findOrCreate("Pat", "Race", "PAT@example.com", "0400 000 006");
  assert.equal(r.client_id, id);
  assert.equal(r.matched_by, "email");
  assert.equal(await clientCount(), 1);
});

// ── Database guard ───────────────────────────────────────────────────────────

test("unique email index: second client with the same email (any case/spaces) is refused; placeholders allowed", async () => {
  await client("A", "One", "same@example.com", null);
  await assert.rejects(client("B", "Two", " SAME@example.com", null), /clients_email_unique/);
  await client("C", "Three", "x@cocoonskinandbeauty.com.au", null);
  await client("D", "Four", "x@cocoonskinandbeauty.com.au", null);
});

test("edit client email to another client's email is blocked (index) with a merge message", async () => {
  await client("Lesley", "Dyer", "lesleydyer@outlook.com", null);
  const other = await client("Lesley", "D", "ldyer2@iinet.net.au", null);
  await assert.rejects(
    db.query("update clients set email = $1 where id = $2", ["lesleydyer@outlook.com", other]),
    (err: { code?: string }) => err.code === "23505",
  );
  assert.equal(
    emailTakenMessage({ first_name: "Lesley", last_name: "Dyer" }),
    "That email belongs to Lesley Dyer, merge the two clients instead",
  );
});

test("migration stops (changes nothing) when two clients already share an email", async () => {
  const fresh = new PGlite();
  await fresh.exec(SCHEMA);
  await fresh.query("insert into clients (first_name, last_name, email, mobile) values ('A','A','dup@example.com','0400 000 007'), ('B','B',' Dup@Example.com','0400000008')");
  await assert.rejects(fresh.exec(MIGRATION), /Clients share an email/);
  await fresh.exec("rollback").catch(() => {});
  const r = await fresh.query<{ mobile: string }>("select mobile from clients order by first_name");
  assert.deepEqual(r.rows.map((x) => x.mobile), ["0400 000 007", "0400000008"], "mobiles untouched");
  const fn = await fresh.query("select 1 from pg_proc where proname = 'find_or_create_client'");
  assert.equal(fn.rows.length, 0, "nothing created");
});

test("migration normalises stored mobiles and emails", async () => {
  const fresh = new PGlite();
  await fresh.exec(SCHEMA);
  await fresh.query("insert into clients (first_name, last_name, email, mobile) values ('A','A',' A@Example.com ','0438 222 499'), ('B','B','b@example.com',''), ('C','C','c@example.com','+44 7700 900123')");
  await fresh.exec(MIGRATION);
  const r = await fresh.query<{ email: string; mobile: string | null }>("select email, mobile from clients order by first_name");
  assert.deepEqual(r.rows, [
    { email: "a@example.com", mobile: "+61438222499" },
    { email: "b@example.com", mobile: null },
    { email: "c@example.com", mobile: "+447700900123" },
  ]);
});

// ── Possible duplicates + "Not a duplicate" ──────────────────────────────────

test("possible duplicates: mobile + first name, or same full name (McLeod = Mcleod); Laceys not listed", async () => {
  const r1 = await client("Rebecca", "McLeod", "r.mcleod1983@outlook.com", "+61438222499");
  const r2 = await client("Rebecca", "Mcleod", "holdenfan_05@hotmail.com", "+61438222499");
  await client("Emma", "Lacey", "emma@example.com", "+61424184946");
  await client("Brock", "Lacey", "brock@example.com", "+61424184946");
  const s1 = await client("Sarah", "O'Brien", "s1@example.com", "+61400000010");
  const s2 = await client("sarah", "OBrien", "s2@example.com", "+61400000011");
  await db.query("insert into appointments (client_id, status) values ($1, 'completed'), ($1, 'cancelled')", [r2]);

  const pairs = (await db.query<{ client_a: string; client_b: string; reason: string; a_appointments: number; b_appointments: number }>(
    "select * from possible_duplicate_clients()",
  )).rows;
  const key = (a: string, b: string) => [a, b].sort().join("|");
  const got = new Map(pairs.map((p) => [key(p.client_a, p.client_b), p]));
  assert.equal(pairs.length, 2);
  assert.equal(got.get(key(r1, r2))?.reason, "Same mobile and first name");
  assert.equal(got.get(key(s1, s2))?.reason, "Same name");
  const rp = got.get(key(r1, r2))!;
  assert.equal(rp.a_appointments + rp.b_appointments, 2);
});

test("\"Not a duplicate\" hides the pair (either order)", async () => {
  const a = await client("Irene", "?", "irene.placeholder@cocoonskinandbeauty.com.au", "+61411111111");
  const b = await client("Irene", "Till", "irene@example.com", "+61411111111");
  assert.equal(await count("select count(*)::int as n from possible_duplicate_clients()"), 1);
  await db.query("select dismiss_duplicate_pair($1, $2, 'admin')", [b, a]);
  await db.query("select dismiss_duplicate_pair($1, $2, 'admin')", [a, b]); // again: no error
  assert.equal(await count("select count(*)::int as n from possible_duplicate_clients()"), 0);
  assert.equal(await count("select count(*)::int as n from client_duplicate_dismissals"), 1);
});

// ── Merge ────────────────────────────────────────────────────────────────────

test("merge moves rows from every FK table (incl. ones added later), merges fields, logs, deletes", async () => {
  // A table this code has never heard of: must still be found and moved.
  await db.exec("create table public.loyalty_notes (id serial primary key, client_id uuid references public.clients(id))");

  const keep = await client("Lesley", "Dyer", "lesleydyer@outlook.com", "+61400000020", {
    notes: "Likes the Indulge facial", created_at: "2026-10-08T00:00:00Z", is_new_client: true,
  });
  const gone = await client("Lesley", "Dyer", "ldyer2@iinet.net.au", "+61400000021", {
    notes: "Allergic to lavender", created_at: "2026-08-27T00:00:00Z", is_new_client: true,
    left_review_at: "2026-09-01T00:00:00Z",
  });
  const sess = (await db.query<{ id: string }>("insert into class_sessions default values returning id")).rows[0].id;
  await db.query("insert into appointments (client_id, status) values ($1, 'completed')", [gone]);
  await db.query("insert into appointments (client_id) values ($1)", [keep]);
  await db.query("insert into class_bookings (session_id, client_id) values ($1, $2)", [sess, gone]);
  await db.query("insert into intake_forms (client_id) values ($1), ($1)", [gone]);
  await db.query("insert into loyalty_notes (client_id) values ($1)", [gone]);
  await db.query("select dismiss_duplicate_pair($1, $2)", [keep, gone]);

  const preview = (await db.query<{ p: Record<string, number> }>("select client_merge_preview($1) as p", [gone])).rows[0].p;
  assert.deepEqual(preview, {
    "appointments.client_id": 1, "class_bookings.client_id": 1, "intake_forms.client_id": 2, "loyalty_notes.client_id": 1,
  });

  const res = (await db.query<{ r: Record<string, unknown> }>(
    "select merge_clients($1, $2, $3, $4, 'admin (desktop)') as r",
    [keep, gone, "LesleyDyer@outlook.com", "0400 000 020"],
  )).rows[0].r;

  assert.deepEqual(res.moved, {
    "appointments.client_id": 1, "class_bookings.client_id": 1, "intake_forms.client_id": 2, "loyalty_notes.client_id": 1,
  });
  assert.deepEqual(res.old_emails, ["ldyer2@iinet.net.au"]);

  assert.equal(await row(gone), undefined, "removed client deleted");
  for (const t of ["appointments", "class_bookings", "intake_forms", "loyalty_notes"]) {
    assert.equal(await count(`select count(*)::int as n from ${t} where client_id = $1`, [gone]), 0, t);
  }
  assert.equal(await count("select count(*)::int as n from appointments where client_id = $1", [keep]), 2);
  assert.equal(await count("select count(*)::int as n from intake_forms where client_id = $1", [keep]), 2, "intake forms moved, not cascaded away");

  const k = await row(keep);
  assert.equal(k.email, "lesleydyer@outlook.com");
  assert.equal(k.mobile, "+61400000020");
  assert.equal(new Date(String(k.created_at)).toISOString(), "2026-08-27T00:00:00.000Z", "earliest client-since kept");
  assert.equal(k.is_new_client, false, "has a completed visit");
  assert.ok(k.left_review_at, "non-empty field the kept record lacked is filled");
  assert.match(String(k.notes), /^Likes the Indulge facial\nAllergic to lavender\nMerged from Lesley Dyer ldyer2@iinet\.net\.au on \d{1,2} \w{3} \d{4}$/);

  const log = (await db.query<{ kept_client_id: string; removed_client_id: string; merged_by: string; removed_client: { email: string } }>(
    "select * from client_merges",
  )).rows;
  assert.equal(log.length, 1);
  assert.equal(log[0].kept_client_id, keep);
  assert.equal(log[0].removed_client_id, gone);
  assert.equal(log[0].merged_by, "admin (desktop)");
  assert.equal(log[0].removed_client.email, "ldyer2@iinet.net.au");
  assert.equal(await count("select count(*)::int as n from client_duplicate_dismissals"), 0);
});

test("merge can keep the other record's email and fills a '?' last name", async () => {
  const keep = await client("Irene", "?", "irene.placeholder@cocoonskinandbeauty.com.au", "+61411111111");
  const gone = await client("Irene", "Till", "irene@example.com", "+61411111111");
  const res = (await db.query<{ r: { old_emails: string[] } }>(
    "select merge_clients($1, $2, 'irene@example.com', '+61411111111') as r", [keep, gone],
  )).rows[0].r;
  const k = await row(keep);
  assert.equal(k.email, "irene@example.com", "takes the removed record's email (no unique clash)");
  assert.equal(k.last_name, "Till");
  assert.deepEqual(res.old_emails, [], "placeholder isn't a Mailchimp contact");
});

test("merge rolls back completely on error", async () => {
  // A later table with a one-row-per-client rule: moving makes it clash mid-merge.
  await db.exec("create table public.client_prefs (client_id uuid unique references public.clients(id))");
  const keep = await client("Ann", "Roll", "ann1@example.com", "+61400000030", { notes: "keep" });
  const gone = await client("Ann", "Roll", "ann2@example.com", "+61400000031", { notes: "gone" });
  await db.query("insert into appointments (client_id) values ($1)", [gone]);
  await db.query("insert into intake_forms (client_id) values ($1)", [gone]);
  await db.query("insert into client_prefs (client_id) values ($1), ($2)", [keep, gone]);
  await db.query("select dismiss_duplicate_pair($1, $2)", [keep, gone]);

  await assert.rejects(db.query("select merge_clients($1, $2, 'ann1@example.com', null)", [keep, gone]));

  assert.ok(await row(gone), "removed client still there");
  assert.equal((await row(keep)).notes, "keep");
  assert.equal(await count("select count(*)::int as n from appointments where client_id = $1", [gone]), 1);
  assert.equal(await count("select count(*)::int as n from intake_forms where client_id = $1", [gone]), 1);
  assert.equal(await count("select count(*)::int as n from client_merges"), 0);
  assert.equal(await count("select count(*)::int as n from client_duplicate_dismissals"), 1);
});

test("merge refuses an email or mobile that belongs to neither client", async () => {
  const a = await client("Bo", "X", "bo1@example.com", "+61400000040");
  const b = await client("Bo", "X", "bo2@example.com", "+61400000041");
  await assert.rejects(db.query("select merge_clients($1, $2, 'evil@example.com', null)", [a, b]), /one of the two clients' emails/);
  await assert.rejects(db.query("select merge_clients($1, $2, 'bo1@example.com', '0499 999 999')", [a, b]), /one of the two clients' mobiles/);
  await assert.rejects(db.query("select merge_clients($1, $1, 'bo1@example.com', null)", [a]), /two different clients/);
  assert.equal(await clientCount(), 2);
});

// ── Pure helpers ─────────────────────────────────────────────────────────────

test("public booking response carries only what was typed, never the matched client's stored details", () => {
  const typed = { first_name: "Rebecca", last_name: "Mcleod", email: "holdenfan_05@hotmail.com", mobile: "0438222499", notes: "hi", is_new_client: true };
  const out = publicBookingClient(typed);
  assert.deepEqual(out, { first_name: "Rebecca", last_name: "Mcleod", email: "holdenfan_05@hotmail.com" });
  assert.ok(!JSON.stringify(out).includes("r.mcleod1983"));
});

test("public booking routes never put stored client details in a response", () => {
  for (const f of ["../app/api/bookings/route.ts", "../app/api/class-bookings/route.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    // storedEmail may only reach mailchimpEmailFor (server-side tagging).
    assert.ok(!/storedEmail|stored_email/.test(src), `${f} reads the stored email directly`);
    assert.ok(src.includes("client: publicBookingClient(client)"), `${f} response client block`);
    // The only things read off the match are its id and how it matched.
    const uses = [...src.matchAll(/clientMatch\.(\w+)/g)].map((m) => m[1]);
    assert.ok(uses.every((u) => u === "clientId" || u === "matchedBy"), `${f}: ${uses.join(", ")}`);
  }
});

test("Mailchimp tags the stored email on a mobile + first-name match, never a placeholder", () => {
  assert.equal(mailchimpEmailFor({ matchedBy: "mobile_name", storedEmail: "r.mcleod1983@outlook.com" }, "holdenfan_05@hotmail.com"), "r.mcleod1983@outlook.com");
  assert.equal(mailchimpEmailFor({ matchedBy: "email", storedEmail: "a@x.com" }, "a@x.com"), "a@x.com");
  assert.equal(mailchimpEmailFor({ matchedBy: "created", storedEmail: "new@x.com" }, "new@x.com"), "new@x.com");
  assert.equal(mailchimpEmailFor({ matchedBy: "mobile_name", storedEmail: "jo@cocoonskinandbeauty.com.au" }, "jo@gmail.com"), null);
});

test("merge result wording + default email = most recently used", () => {
  assert.deepEqual(describeMergeMoves({ "public.appointments.client_id": 2, "intake_forms.client_id": 1, "loyalty_notes.client_id": 0 }), [
    { key: "appointments.client_id", label: "appointments", count: 2 },
    { key: "intake_forms.client_id", label: "intake forms", count: 1 },
    { key: "loyalty_notes.client_id", label: "loyalty notes", count: 0 },
  ]);
  assert.deepEqual(oldEmailWarnings(["ldyer2@iinet.net.au"]), ["Old email ldyer2@iinet.net.au may still be in Mailchimp, archive it there"]);
  const old = { id: "a", email: "ldyer2@iinet.net.au", mobile: null, created_at: "2026-08-27T00:00:00Z", last_booked: "2026-08-27T00:00:00Z" };
  const recent = { id: "b", email: "lesleydyer@outlook.com", mobile: null, created_at: "2026-10-08T00:00:00Z", last_booked: "2026-11-01T00:00:00Z" };
  assert.equal(defaultMergeEmail(old, recent), "lesleydyer@outlook.com");
  assert.equal(defaultMergeEmail(recent, old), "lesleydyer@outlook.com");
});
