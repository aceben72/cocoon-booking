import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAppointmentLoyalty,
  computeLoyaltyStatus,
  type AppointmentLoyalty,
  type LoyaltyAppointment,
  type LoyaltyStatus,
} from "./loyalty-rules";

export * from "./loyalty-rules";

interface ClientLoyaltyData {
  excluded: boolean;
  appointments: LoyaltyAppointment[];
}

/** Every appointment + exclusion flag for the given clients, keyed by client id. Read-only. */
async function loadClientLoyaltyData(
  db: SupabaseClient,
  clientIds: string[],
): Promise<Map<string, ClientLoyaltyData>> {
  const ids = [...new Set(clientIds)];
  const result = new Map<string, ClientLoyaltyData>();
  if (ids.length === 0) return result;

  const [{ data: clients, error: clientErr }, { data: rows, error: apptErr }] = await Promise.all([
    db.from("clients").select("id, exclude_from_loyalty").in("id", ids),
    db
      .from("appointments")
      .select("id, client_id, service_id, start_datetime, status, loyalty_discount_cents, facial_package_redemptions ( id )")
      .in("client_id", ids),
  ]);
  if (clientErr || apptErr) {
    throw new Error(`loyalty lookup failed: ${(clientErr ?? apptErr)?.message}`);
  }

  for (const c of clients ?? []) {
    result.set(c.id as string, { excluded: !!c.exclude_from_loyalty, appointments: [] });
  }
  for (const r of rows ?? []) {
    result.get(r.client_id as string)?.appointments.push({
      id: r.id as string,
      serviceId: r.service_id as string,
      startISO: r.start_datetime as string,
      status: r.status as string,
      loyaltyDiscountCents: (r.loyalty_discount_cents as number) ?? 0,
      paidViaPackage: Array.isArray(r.facial_package_redemptions) && r.facial_package_redemptions.length > 0,
    });
  }
  return result;
}

/**
 * Loyalty status for a client as at `asOf` (default now; for a booking, pass
 * its start time). Read-only. See lib/loyalty-rules.ts for the rules.
 */
export async function getLoyaltyStatus(
  db: SupabaseClient,
  clientId: string,
  asOf: Date | string = new Date(),
): Promise<LoyaltyStatus> {
  const data = (await loadClientLoyaltyData(db, [clientId])).get(clientId);
  if (!data) throw new Error(`loyalty lookup failed: client ${clientId} not found`);
  return computeLoyaltyStatus(data.appointments, { excluded: data.excluded, asOf });
}

/**
 * Status for the client with this email (matched case-insensitively, as
 * POST /api/bookings does), or null if there's no single matching client.
 */
export async function getLoyaltyStatusByEmail(
  db: SupabaseClient,
  email: string,
  asOf: Date | string = new Date(),
): Promise<LoyaltyStatus | null> {
  const { data: client } = await db.from("clients").select("id").ilike("email", email.trim()).maybeSingle();
  if (!client) return null;
  return getLoyaltyStatus(db, client.id as string, asOf);
}

/**
 * Loyalty state of every qualifying booking belonging to these clients,
 * judged on completions as of now — for admin booking views. Read-only.
 */
export async function getAppointmentLoyaltyMap(
  db: SupabaseClient,
  clientIds: string[],
  now: Date = new Date(),
): Promise<Map<string, AppointmentLoyalty>> {
  const result = new Map<string, AppointmentLoyalty>();
  for (const data of (await loadClientLoyaltyData(db, clientIds)).values()) {
    for (const [id, l] of computeAppointmentLoyalty(data.appointments, { excluded: data.excluded, now })) {
      result.set(id, l);
    }
  }
  return result;
}

export interface AppointmentReward {
  due: boolean;
  amountCents: number;
  /** "applied" = already recorded on this appointment; "not_due" covers everything else. */
  state: "due" | "applied" | "not_due";
}

/**
 * Is the loyalty reward due on this appointment right now, and how much?
 * For the Complete/payment panel. Read-only — the caller records the
 * discount in appointments.loyalty_discount_cents.
 */
export async function getLoyaltyRewardForAppointment(
  db: SupabaseClient,
  appointmentId: string,
  now: Date = new Date(),
): Promise<AppointmentReward> {
  const { data: appt, error } = await db
    .from("appointments")
    .select("client_id")
    .eq("id", appointmentId)
    .single();
  if (error || !appt) throw new Error(`loyalty lookup failed: appointment ${appointmentId} not found`);

  const data = (await loadClientLoyaltyData(db, [appt.client_id as string])).get(appt.client_id as string);
  if (!data) return { due: false, amountCents: 0, state: "not_due" };

  const l = computeAppointmentLoyalty(data.appointments, { excluded: data.excluded, now, includeId: appointmentId })
    .get(appointmentId);
  if (l?.kind === "due") return { due: true, amountCents: l.amountCents, state: "due" };
  if (l?.kind === "applied") return { due: false, amountCents: l.amountCents, state: "applied" };
  return { due: false, amountCents: 0, state: "not_due" };
}

/**
 * Adds `loyalty` (or null) to each appointment for admin views. Never throws —
 * a loyalty lookup failure mustn't stop the appointments loading.
 */
export async function withAppointmentLoyalty<T extends { id: string; client_id: string }>(
  db: SupabaseClient,
  appointments: T[],
): Promise<(T & { loyalty: AppointmentLoyalty | null })[]> {
  let map = new Map<string, AppointmentLoyalty>();
  try {
    map = await getAppointmentLoyaltyMap(db, appointments.map((a) => a.client_id));
  } catch (err) {
    console.error("[loyalty] admin appointment loyalty failed:", err);
  }
  return appointments.map((a) => ({ ...a, loyalty: map.get(a.id) ?? null }));
}
