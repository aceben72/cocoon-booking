-- ============================================================
-- November 2026 — stop duplicate client records
-- Run in Supabase SQL Editor BEFORE deploying the matching code
-- (the booking routes call find_or_create_client(); without it every
-- booking fails to save the client).
--
-- What it does, in one transaction:
--   0. Stops (raises) if any two clients already share an email once
--      trimmed + lower-cased. Nothing is changed in that case.
--   1. normalise_mobile(): one rule for mobiles (same as lib/utils.ts).
--   2. Normalises stored mobiles and emails (trimmed lower-case).
--   3. Unique index on lower(trim(email)), placeholders + blanks excluded.
--   4. client_duplicate_dismissals + client_merges (merge log) tables.
--   5. Functions: find_client_match, find_or_create_client,
--      possible_duplicate_clients, dismiss_duplicate_pair,
--      client_merge_preview, merge_clients.
--
-- Checked read-only against live on 13 Nov 2026: no email collisions,
-- all 168 non-blank mobiles already +614XXXXXXXX, no emails needing
-- lower-casing. Steps 2's updates are expected to touch 0 rows.
-- Safe to re-run.
-- ============================================================
begin;

-- ── 0. Collision guard ───────────────────────────────────────────────────────
-- Same query as the read-only check run before writing this file:
--   select lower(trim(email)), count(*), array_agg(id) from clients
--   where coalesce(trim(email),'') <> ''
--     and lower(trim(email)) not like '%@cocoonskinandbeauty.com.au'
--   group by 1 having count(*) > 1;
do $$
declare
  v_list text;
begin
  select string_agg(norm || ' (' || n || ' clients: ' || ids || ')', '; ')
    into v_list
  from (
    select lower(trim(email)) as norm, count(*) as n, string_agg(id::text, ', ') as ids
    from public.clients
    where coalesce(trim(email), '') <> ''
      and lower(trim(email)) not like '%@cocoonskinandbeauty.com.au'
    group by 1
    having count(*) > 1
  ) c;
  if v_list is not null then
    raise exception 'Clients share an email — merge them first, nothing changed: %', v_list;
  end if;
end $$;

-- ── 1. Mobile normalisation (mirror of normaliseMobile() in lib/utils.ts) ────
-- 0438 222 499 / 0438222499 / 438222499 / 61438222499 / +61438222499 /
-- +61 0438 222 499 / (0438) 222-499  →  +61438222499.
-- Anything else: digits only, keeping a leading +. Blank → null.
create or replace function public.normalise_mobile(raw text)
returns text
language plpgsql
immutable
as $$
declare
  v_plus   boolean := left(btrim(coalesce(raw, '')), 1) = '+';
  v_digits text    := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
begin
  if v_digits = '' then
    return null;
  elsif v_digits ~ '^610\d{9}$' then
    return '+61' || substr(v_digits, 4);
  elsif v_digits ~ '^61\d{9}$' then
    return '+' || v_digits;
  elsif v_digits ~ '^0\d{9}$' then
    return '+61' || substr(v_digits, 2);
  elsif v_digits ~ '^4\d{8}$' then
    return '+61' || v_digits;
  end if;
  return case when v_plus then '+' else '' end || v_digits;
end;
$$;

-- Lower-case, trimmed, letters only: McLeod = Mcleod = Mc Leod, O'Brien = OBrien.
create or replace function public.client_name_key(raw text)
returns text
language sql
immutable
as $$ select regexp_replace(lower(coalesce(raw, '')), '[^a-z]', '', 'g') $$;

create or replace function public.is_placeholder_email(raw text)
returns boolean
language sql
immutable
as $$ select lower(btrim(coalesce(raw, ''))) like '%@cocoonskinandbeauty.com.au' $$;

-- ── 2. Normalise stored data ─────────────────────────────────────────────────
-- Mobiles that don't look Australian are reported (NOTICE) and left as
-- digits only, never dropped.
do $$
declare
  r record;
begin
  for r in
    select id, first_name, last_name, mobile
    from public.clients
    where public.normalise_mobile(mobile) is not null
      and public.normalise_mobile(mobile) !~ '^\+61\d{9}$'
  loop
    raise notice 'Not an Australian number, kept as digits: % % (%) %', r.first_name, r.last_name, r.id, r.mobile;
  end loop;
end $$;

update public.clients
   set mobile = public.normalise_mobile(mobile)
 where mobile is distinct from public.normalise_mobile(mobile);

update public.clients
   set email = lower(btrim(email))
 where email <> lower(btrim(email));

-- ── 3. One client per real email ─────────────────────────────────────────────
create unique index if not exists clients_email_unique
  on public.clients (lower(btrim(email)))
  where btrim(email) <> ''
    and lower(btrim(email)) not like '%@cocoonskinandbeauty.com.au';

-- ── 4. Tables ────────────────────────────────────────────────────────────────
-- "Not a duplicate" decisions. Ids stored in order (client_a < client_b).
create table if not exists public.client_duplicate_dismissals (
  client_a     uuid not null references public.clients(id) on delete cascade,
  client_b     uuid not null references public.clients(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  dismissed_by text,
  primary key (client_a, client_b),
  check (client_a < client_b)
);
alter table public.client_duplicate_dismissals enable row level security;

-- Merge log. No foreign keys on purpose: the removed client no longer
-- exists, and a later merge of the kept client must not rewrite history.
create table if not exists public.client_merges (
  id               uuid primary key default gen_random_uuid(),
  kept_client_id   uuid not null,
  removed_client_id uuid not null,
  removed_client   jsonb not null,      -- snapshot of the deleted row
  kept_before      jsonb not null,      -- snapshot of the kept row before the merge
  moved_rows       jsonb not null,      -- { "public.appointments.client_id": 3, ... }
  merged_by        text,
  merged_at        timestamptz not null default now()
);
alter table public.client_merges enable row level security;

-- ── 5a. Lookup ───────────────────────────────────────────────────────────────
-- a. Real email (trimmed, case-insensitive) → that client.
-- b. Else normalised mobile + first name (trimmed, case-insensitive) → only
--    if exactly ONE client matches.
-- Placeholder emails are never matched on.
create or replace function public.find_client_match(
  p_email      text,
  p_first_name text,
  p_mobile     text
) returns table (client_id uuid, matched_by text, stored_email text, candidates integer)
language plpgsql
stable
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_first  text := lower(btrim(coalesce(p_first_name, '')));
  v_mobile text := public.normalise_mobile(p_mobile);
  v_ids    uuid[];
begin
  if v_email <> '' and not public.is_placeholder_email(v_email) then
    return query
      select c.id, 'email'::text, c.email, 1
      from public.clients c
      where lower(btrim(c.email)) = v_email
      order by c.created_at
      limit 1;
    if found then return; end if;
  end if;

  if v_mobile is not null and v_first <> '' then
    select array_agg(c.id order by c.created_at) into v_ids
    from public.clients c
    where public.normalise_mobile(c.mobile) = v_mobile
      and lower(btrim(c.first_name)) = v_first;

    if coalesce(array_length(v_ids, 1), 0) = 1 then
      return query
        select c.id, 'mobile_name'::text, c.email, 1
        from public.clients c where c.id = v_ids[1];
      return;
    elsif coalesce(array_length(v_ids, 1), 0) > 1 then
      -- Ambiguous: report how many, match nothing.
      return query select null::uuid, 'ambiguous'::text, null::text, array_length(v_ids, 1);
      return;
    end if;
  end if;
end;
$$;

-- ── 5b. Lookup or create, used by every booking route ────────────────────────
-- matched_by: 'email' | 'mobile_name' | 'created'.
-- A mobile + first-name match never changes the stored email; it appends
-- "Also booked with <email> on <date>" to notes so Amanda can choose.
-- p_refresh_on_email_match: public booking only — refresh name + mobile
-- on an email match (behaviour before this change) and append typed notes.
-- A unique violation (double submit / two tabs) re-runs the lookup.
create or replace function public.find_or_create_client(
  p_first_name             text,
  p_last_name              text,
  p_email                  text,
  p_mobile                 text,
  p_is_new_client          boolean default false,
  p_notes                  text    default null,
  p_refresh_on_email_match boolean default false
) returns table (client_id uuid, matched_by text, stored_email text)
language plpgsql
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_mobile text := public.normalise_mobile(p_mobile);
  v_notes  text := nullif(btrim(coalesce(p_notes, '')), '');
  v_today  text := to_char((now() at time zone 'Australia/Brisbane')::date, 'FMDD Mon YYYY');
  v_match  record;
  v_id     uuid;
begin
  select * into v_match from public.find_client_match(v_email, p_first_name, v_mobile) m
  where m.client_id is not null;

  if found and v_match.matched_by = 'email' then
    if p_refresh_on_email_match then
      update public.clients c
         set first_name = coalesce(nullif(btrim(p_first_name), ''), c.first_name),
             last_name  = coalesce(nullif(btrim(p_last_name), ''), c.last_name),
             mobile     = coalesce(v_mobile, c.mobile),
             notes      = case when v_notes is null then c.notes
                               else concat_ws(E'\n', nullif(c.notes, ''), v_notes) end
       where c.id = v_match.client_id;
    end if;
    return query select v_match.client_id, 'email'::text, v_match.stored_email;
    return;
  end if;

  if found and v_match.matched_by = 'mobile_name' then
    if v_email <> '' and not public.is_placeholder_email(v_email)
       and v_email <> lower(btrim(coalesce(v_match.stored_email, ''))) then
      update public.clients c
         set notes = concat_ws(E'\n', nullif(c.notes, ''),
                               'Also booked with ' || v_email || ' on ' || v_today)
       where c.id = v_match.client_id
         and position(('Also booked with ' || v_email) in coalesce(c.notes, '')) = 0;
    end if;
    return query select v_match.client_id, 'mobile_name'::text, v_match.stored_email;
    return;
  end if;

  begin
    insert into public.clients (first_name, last_name, email, mobile, is_new_client, notes)
    values (btrim(coalesce(p_first_name, '')), btrim(coalesce(p_last_name, '')), v_email,
            v_mobile, coalesce(p_is_new_client, false), v_notes)
    returning id into v_id;
  exception when unique_violation then
    -- Someone else saved this email a moment ago: use theirs.
    select c.id into v_id from public.clients c
     where lower(btrim(c.email)) = v_email
     order by c.created_at limit 1;
    if v_id is null then raise; end if;
    return query select v_id, 'email'::text, v_email;
    return;
  end;

  return query select v_id, 'created'::text, v_email;
end;
$$;

-- ── 5c. Possible duplicates ──────────────────────────────────────────────────
-- Pairs with the same normalised mobile + first name, or the same first +
-- last name (letters only, case-insensitive). Dismissed pairs excluded.
create or replace function public.possible_duplicate_clients()
returns table (
  client_a uuid, client_b uuid, reason text,
  a_first_name text, a_last_name text, a_email text, a_mobile text, a_created_at timestamptz,
  a_appointments integer, a_classes integer, a_last_visit timestamptz, a_last_booked timestamptz,
  b_first_name text, b_last_name text, b_email text, b_mobile text, b_created_at timestamptz,
  b_appointments integer, b_classes integer, b_last_visit timestamptz, b_last_booked timestamptz
)
language sql
stable
as $$
  with c as (
    select cl.*,
           public.normalise_mobile(cl.mobile) as m,
           lower(btrim(cl.first_name))        as f,
           public.client_name_key(cl.first_name) as fk,
           public.client_name_key(cl.last_name)  as lk
    from public.clients cl
  ),
  stats as (
    select c.id,
      (select count(*) from public.appointments a where a.client_id = c.id)::int as appts,
      (select count(*) from public.class_bookings b where b.client_id = c.id)::int as classes,
      greatest(
        (select max(a.start_datetime) from public.appointments a
          where a.client_id = c.id and a.status in ('confirmed','completed') and a.start_datetime <= now()),
        (select max(s.start_datetime) from public.class_bookings b
           join public.class_sessions s on s.id = b.session_id
          where b.client_id = c.id and b.status <> 'cancelled' and s.start_datetime <= now())
      ) as last_visit,
      -- When this record was last used to book (incl. future bookings):
      -- the default email to keep on a merge is the most recently used.
      greatest(
        (select max(a.created_at) from public.appointments a where a.client_id = c.id),
        (select max(b.created_at) from public.class_bookings b where b.client_id = c.id)
      ) as last_booked
    from c
  ),
  pairs as (
    select a.id as a_id, b.id as b_id,
           case when a.m is not null and a.m = b.m and a.f <> '' and a.f = b.f
                then 'Same mobile and first name' else 'Same name' end as reason
    from c a join c b on a.id < b.id
    where (a.m is not null and a.m = b.m and a.f <> '' and a.f = b.f)
       or (a.fk <> '' and a.lk <> '' and a.fk = b.fk and a.lk = b.lk)
  )
  select p.a_id, p.b_id, p.reason,
         a.first_name, a.last_name, a.email, a.mobile, a.created_at, sa.appts, sa.classes, sa.last_visit, sa.last_booked,
         b.first_name, b.last_name, b.email, b.mobile, b.created_at, sb.appts, sb.classes, sb.last_visit, sb.last_booked
  from pairs p
  join public.clients a on a.id = p.a_id
  join public.clients b on b.id = p.b_id
  join stats sa on sa.id = p.a_id
  join stats sb on sb.id = p.b_id
  where not exists (
    select 1 from public.client_duplicate_dismissals d
    where d.client_a = p.a_id and d.client_b = p.b_id
  )
  order by greatest(sa.last_visit, sb.last_visit) desc nulls last, a.first_name;
$$;

create or replace function public.dismiss_duplicate_pair(p_one uuid, p_two uuid, p_by text default null)
returns void
language sql
as $$
  insert into public.client_duplicate_dismissals (client_a, client_b, dismissed_by)
  values (least(p_one, p_two), greatest(p_one, p_two), p_by)
  on conflict do nothing;
$$;

-- ── 5d. Merge ────────────────────────────────────────────────────────────────
-- Every foreign key to clients(id), read from the catalogue at run time —
-- never a hand-written list, so a table added later is still moved.
-- (13 Nov 2026: appointments, class_bookings, intake_forms [ON DELETE
-- CASCADE], plus client_duplicate_dismissals from this file.)
create or replace function public._client_fk_columns()
returns table (tbl regclass, col name)
language sql
stable
as $$
  select con.conrelid::regclass, a.attname
  from pg_constraint con
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
  where con.contype = 'f'
    and con.confrelid = 'public.clients'::regclass
    and array_length(con.conkey, 1) = 1
  order by 1::text, 2;
$$;

-- What a merge would move off this client: { "public.appointments.client_id": 2, ... }
create or replace function public.client_merge_preview(p_client uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  r     record;
  n     integer;
  v_out jsonb := '{}'::jsonb;
begin
  for r in select * from public._client_fk_columns() loop
    if r.tbl = 'public.client_duplicate_dismissals'::regclass then continue; end if;
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using p_client;
    v_out := v_out || jsonb_build_object(r.tbl::text || '.' || r.col, n);
  end loop;
  return v_out;
end;
$$;

-- Moves everything from p_remove to p_keep, merges fields, logs, deletes
-- p_remove. One transaction: any error leaves both clients untouched.
-- p_email / p_mobile: which of the two to keep (must belong to one of them).
create or replace function public.merge_clients(
  p_keep      uuid,
  p_remove    uuid,
  p_email     text,
  p_mobile    text,
  p_merged_by text default null
) returns jsonb
language plpgsql
as $$
declare
  k        public.clients%rowtype;
  d        public.clients%rowtype;
  r        record;
  n        integer;
  v_moved  jsonb := '{}'::jsonb;
  v_email  text  := lower(btrim(coalesce(p_email, '')));
  v_mobile text  := public.normalise_mobile(p_mobile);
  v_today  text  := to_char((now() at time zone 'Australia/Brisbane')::date, 'FMDD Mon YYYY');
  v_completed boolean;
  v_merge_id uuid;
begin
  if p_keep is null or p_remove is null or p_keep = p_remove then
    raise exception 'Choose two different clients' using errcode = '22023';
  end if;

  -- Lock both rows in a fixed order so two merges can't deadlock.
  perform 1 from public.clients where id in (p_keep, p_remove) order by id for update;
  select * into k from public.clients where id = p_keep;
  if not found then raise exception 'Client to keep not found' using errcode = '22023'; end if;
  select * into d from public.clients where id = p_remove;
  if not found then raise exception 'Client to merge in not found' using errcode = '22023'; end if;

  if v_email not in (lower(btrim(k.email)), lower(btrim(d.email))) then
    raise exception 'Email must be one of the two clients'' emails' using errcode = '22023';
  end if;
  if v_mobile is not null
     and v_mobile is distinct from public.normalise_mobile(k.mobile)
     and v_mobile is distinct from public.normalise_mobile(d.mobile) then
    raise exception 'Mobile must be one of the two clients'' mobiles' using errcode = '22023';
  end if;

  -- Dismissals involving the removed client mean nothing after the merge.
  delete from public.client_duplicate_dismissals where p_remove in (client_a, client_b);

  -- Move every row that points at the removed client (before the delete:
  -- intake_forms would cascade away otherwise).
  for r in select * from public._client_fk_columns() loop
    if r.tbl = 'public.client_duplicate_dismissals'::regclass then continue; end if;
    execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
      using p_keep, p_remove;
    get diagnostics n = row_count;
    v_moved := v_moved || jsonb_build_object(r.tbl::text || '.' || r.col, n);
  end loop;

  select exists (
    select 1 from public.appointments where client_id = p_keep and status = 'completed'
  ) into v_completed;

  insert into public.client_merges (kept_client_id, removed_client_id, removed_client, kept_before, moved_rows, merged_by)
  values (p_keep, p_remove, to_jsonb(d), to_jsonb(k), v_moved, p_merged_by)
  returning id into v_merge_id;

  -- Delete first so the kept row can take the removed row's email
  -- without tripping the unique index.
  delete from public.clients where id = p_remove;

  update public.clients c set
    email      = v_email,
    mobile     = coalesce(v_mobile, public.normalise_mobile(k.mobile), public.normalise_mobile(d.mobile)),
    first_name = case when public.client_name_key(k.first_name) = '' then d.first_name else k.first_name end,
    last_name  = case when public.client_name_key(k.last_name)  = '' then d.last_name  else k.last_name  end,
    created_at = least(k.created_at, d.created_at),
    is_new_client = case when v_completed then false else (k.is_new_client and d.is_new_client) end,
    exclude_from_loyalty = k.exclude_from_loyalty or d.exclude_from_loyalty,
    left_review_at = coalesce(k.left_review_at, d.left_review_at),
    notes = concat_ws(E'\n',
      nullif(btrim(coalesce(k.notes, '')), ''),
      nullif(btrim(coalesce(d.notes, '')), ''),
      'Merged from ' || btrim(d.first_name || ' ' || d.last_name) || ' ' || d.email || ' on ' || v_today)
  where c.id = p_keep;

  return jsonb_build_object(
    'merge_id',     v_merge_id,
    'kept_id',      p_keep,
    'removed_id',   p_remove,
    'kept_email',   v_email,
    'removed_email', lower(btrim(d.email)),
    'old_emails',   (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
                       select distinct lower(btrim(x)) as e from unnest(array[k.email, d.email]) x
                       where lower(btrim(x)) <> v_email and not public.is_placeholder_email(x)
                     ) s),
    'moved',        v_moved
  );
end;
$$;

-- Service role only (API routes). Not callable from the browser.
revoke execute on function public.find_client_match(text, text, text) from public, anon, authenticated;
revoke execute on function public.find_or_create_client(text, text, text, text, boolean, text, boolean) from public, anon, authenticated;
revoke execute on function public.possible_duplicate_clients() from public, anon, authenticated;
revoke execute on function public.dismiss_duplicate_pair(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._client_fk_columns() from public, anon, authenticated;
revoke execute on function public.client_merge_preview(uuid) from public, anon, authenticated;
revoke execute on function public.merge_clients(uuid, uuid, text, text, text) from public, anon, authenticated;

commit;

-- After running: should return no rows (every stored mobile normalised).
-- select id, first_name, last_name, mobile from public.clients
--  where mobile is distinct from public.normalise_mobile(mobile);
