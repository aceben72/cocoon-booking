import { createClient } from "@supabase/supabase-js";
import { ClientsTable, type ClientRow } from "./ClientsTable";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  // ── Fetch clients (optionally filtered) ──────────────────────────────────
  let clientQuery = supabase()
    .from("clients")
    .select("id, first_name, last_name, email, mobile, is_new_client, created_at")
    .order("created_at", { ascending: false });

  if (q) {
    clientQuery = clientQuery.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }

  const { data: clients, error: clientsErr } = await clientQuery;

  let fetchError = "";
  if (clientsErr) {
    fetchError = clientsErr.message;
  }

  // ── Fetch appointment stats for matched clients ───────────────────────────
  const clientIds = (clients ?? []).map((c) => c.id);
  let appts: Array<{
    client_id: string;
    start_datetime: string;
    amount_paid_cents: number;
    status: string;
  }> = [];

  if (clientIds.length > 0) {
    const { data } = await supabase()
      .from("appointments")
      .select("client_id, start_datetime, amount_paid_cents, status")
      .in("client_id", clientIds);
    appts = data ?? [];
  }

  // ── Aggregate per client ──────────────────────────────────────────────────
  const statsMap = new Map<
    string,
    {
      firstVisit: string | null;
      lastVisit: string | null;
      totalVisits: number;
      totalSpentCents: number;
    }
  >();

  for (const appt of appts) {
    let s = statsMap.get(appt.client_id);
    if (!s) {
      s = { firstVisit: null, lastVisit: null, totalVisits: 0, totalSpentCents: 0 };
      statsMap.set(appt.client_id, s);
    }
    if (!s.firstVisit || appt.start_datetime < s.firstVisit) s.firstVisit = appt.start_datetime;
    if (!s.lastVisit  || appt.start_datetime > s.lastVisit)  s.lastVisit  = appt.start_datetime;
    if (appt.status === "completed") {
      s.totalVisits++;
      s.totalSpentCents += appt.amount_paid_cents;
    }
  }

  // ── Build final list sorted by most recent visit desc ────────────────────
  const enriched: ClientRow[] = (clients ?? [])
    .map((c) => ({
      ...c,
      ...(statsMap.get(c.id) ?? {
        firstVisit: null,
        lastVisit: null,
        totalVisits: 0,
        totalSpentCents: 0,
      }),
    }))
    .sort((a, b) => {
      if (!a.lastVisit && !b.lastVisit) return 0;
      if (!a.lastVisit) return 1;
      if (!b.lastVisit) return -1;
      return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl">
          Clients
        </h1>
        <span className="text-sm text-[#7a6f68]">
          {enriched.length} client{enriched.length !== 1 ? "s" : ""}
          {q && ` matching "${q}"`}
        </span>
      </div>

      {fetchError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {fetchError}
        </div>
      ) : (
        <ClientsTable clients={enriched} initialQ={q} />
      )}
    </div>
  );
}
