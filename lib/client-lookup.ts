import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one way a booking finds or creates its client. Every route that used
 * to insert into clients calls this; the rules live in Postgres
 * (find_or_create_client in supabase/migrations/client_dedupe_2026_11.sql)
 * so the lookup and the insert happen in one statement:
 *   a. real email, trimmed + case-insensitive → that client
 *   b. else normalised mobile + first name → only if exactly one client
 *      matches; her stored email is kept and "Also booked with <email> on
 *      <date>" is added to her notes
 *   c. else a new client
 * Placeholder emails (@cocoonskinandbeauty.com.au) are never matched on.
 * A double submit (unique email violation) re-runs the lookup.
 *
 * PRIVACY: a mobile + first-name match only links the booking server-side.
 * Nothing from the matched record (stored email, notes, history, loyalty)
 * may go back to the public booking flow — see publicBookingClient().
 */

export type ClientMatchedBy = "email" | "mobile_name" | "created";

export interface ClientLookupResult {
  clientId: string;
  matchedBy: ClientMatchedBy;
  /** The email on the client record (differs from the typed one on a mobile_name match). Server-side only. */
  storedEmail: string;
}

export interface ClientDetailsInput {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string | null;
  isNewClient?: boolean;
  notes?: string | null;
  /** Public booking only: refresh name + mobile and add typed notes on an email match. */
  refreshOnEmailMatch?: boolean;
}

export async function findOrCreateClient(
  db: SupabaseClient,
  input: ClientDetailsInput,
): Promise<ClientLookupResult> {
  const { data, error } = await db.rpc("find_or_create_client", {
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_email: input.email.trim().toLowerCase(),
    p_mobile: input.mobile?.trim() || null, // normalised in SQL (public.normalise_mobile)
    p_is_new_client: input.isNewClient ?? false,
    p_notes: input.notes?.trim() || null,
    p_refresh_on_email_match: input.refreshOnEmailMatch ?? false,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.client_id) {
    throw new Error(`Couldn't save client details: ${error?.message ?? "no client returned"}`);
  }
  return { clientId: row.client_id, matchedBy: row.matched_by, storedEmail: row.stored_email };
}

/** Lookup only (no insert): the admin booking needs the client before it decides to save. */
export async function findClientMatch(
  db: SupabaseClient,
  input: { email: string; firstName: string; mobile: string | null },
): Promise<Omit<ClientLookupResult, "matchedBy"> & { matchedBy: "email" | "mobile_name" } | null> {
  const { data, error } = await db.rpc("find_client_match", {
    p_email: input.email.trim().toLowerCase(),
    p_first_name: input.firstName.trim(),
    p_mobile: input.mobile?.trim() || null, // normalised in SQL (public.normalise_mobile)
  });
  if (error) throw new Error(`Client lookup failed: ${error.message}`);
  const row = (Array.isArray(data) ? data : [data]).find((r) => r?.client_id);
  return row ? { clientId: row.client_id, matchedBy: row.matched_by, storedEmail: row.stored_email } : null;
}

/**
 * Which address Mailchimp tags go on: the stored email when the booking
 * was matched by mobile + first name (her contact already exists there),
 * otherwise the typed one. Null for placeholder addresses.
 */
export function mailchimpEmailFor(match: Pick<ClientLookupResult, "matchedBy" | "storedEmail">, typedEmail: string): string | null {
  const email = (match.matchedBy === "mobile_name" ? match.storedEmail : typedEmail).trim();
  // Same rule as isPlaceholderEmail() in lib/utils.ts (kept import-free so node --test can load this file).
  return email && !/@cocoonskinandbeauty\.com\.au$/i.test(email) ? email : null;
}

/**
 * The client block of a public booking response: only what the person
 * typed, never anything read from a matched record.
 */
export function publicBookingClient(typed: { first_name: string; last_name: string; email: string }) {
  return { first_name: typed.first_name, last_name: typed.last_name, email: typed.email };
}

/** Admin "Edit client details": the email already belongs to someone else. */
export function emailTakenMessage(other: { first_name: string; last_name: string }): string {
  const name = `${other.first_name} ${other.last_name}`.trim();
  return `That email belongs to ${name}, merge the two clients instead`;
}
