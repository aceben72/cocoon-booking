import { createClient } from "@supabase/supabase-js";
import { AppointmentTable } from "./AppointmentTable";

export const dynamic = "force-dynamic";

function todayAEST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());
}

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface RawAppointment {
  id: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
  amount_cents: number;
  amount_paid_cents: number;
  square_payment_id: string | null;
  payment_link_token: string | null;
  notes: string | null;
  created_at: string;
  services: { name: string; category: string; duration_minutes: number } | null;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    mobile: string;
    is_new_client: boolean;
  } | null;
}

export interface RawBlockedPeriod {
  id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
}

export interface RawClassBooking {
  id: string;
  status: string;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    mobile: string;
  } | null;
}

export interface RawClassSession {
  id: string;
  class_type: string;
  title: string;
  start_datetime: string;
  duration_minutes: number;
  capacity: number;
  description: string | null;
  active: boolean;
  class_bookings: RawClassBooking[];
}

async function getAppointments(status: string, from: string, to: string): Promise<RawAppointment[]> {
  let query = supabase()
    .from("appointments")
    .select(`
      id, start_datetime, end_datetime, status, amount_cents, amount_paid_cents,
      square_payment_id, payment_link_token, notes, created_at,
      services ( name, category, duration_minutes ),
      clients ( first_name, last_name, email, mobile, is_new_client )
    `)
    .order("start_datetime", { ascending: true });

  if (status !== "all") query = query.eq("status", status);
  query = query.neq("status", "cancelled");
  if (from) query = query.gte("start_datetime", new Date(from).toISOString());
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("start_datetime", toDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as RawAppointment[];
}

async function getBlockedPeriods(from: string, to: string): Promise<RawBlockedPeriod[]> {
  let query = supabase()
    .from("blocked_periods")
    .select("id, start_datetime, end_datetime, reason")
    .order("start_datetime", { ascending: true });

  if (from) query = query.gte("start_datetime", new Date(from).toISOString());
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("start_datetime", toDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as RawBlockedPeriod[];
}

async function getClassSessions(from: string, to: string): Promise<RawClassSession[]> {
  let query = supabase()
    .from("class_sessions")
    .select(`
      id, class_type, title, start_datetime, duration_minutes, capacity, description, active,
      class_bookings(id, status, clients(first_name, last_name, email, mobile))
    `)
    .order("start_datetime", { ascending: true })
    .eq("active", true);

  if (from) query = query.gte("start_datetime", new Date(from).toISOString());
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("start_datetime", toDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as RawClassSession[];
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? "all";
  const today = todayAEST();
  const from = params.from !== undefined ? params.from : today;
  const to   = params.to   !== undefined ? params.to   : today;

  let appointments: RawAppointment[] = [];
  let blockedPeriods: RawBlockedPeriod[] = [];
  let classSessions: RawClassSession[] = [];
  let fetchError = "";
  try {
    [appointments, blockedPeriods, classSessions] = await Promise.all([
      getAppointments(status, from, to),
      getBlockedPeriods(from, to),
      getClassSessions(from, to),
    ]);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load appointments";
  }

  const total = appointments.length + blockedPeriods.length + classSessions.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl">
          Appointments
        </h1>
        <span className="text-sm text-[#7a6f68]">
          {total} result{total !== 1 ? "s" : ""}
        </span>
      </div>

      {fetchError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {fetchError}
        </div>
      ) : (
        <AppointmentTable
          appointments={appointments}
          blockedPeriods={blockedPeriods}
          classSessions={classSessions}
          currentStatus={status}
          currentFrom={from}
          currentTo={to}
        />
      )}
    </div>
  );
}
