import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  confirmed:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed:  "bg-blue-50   text-blue-700   border-blue-200",
  cancelled:  "bg-red-50    text-red-600    border-red-200",
  pending:    "bg-amber-50  text-amber-700  border-amber-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium capitalize
                      ${STATUS_COLOURS[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#e8e0d8] rounded-xl px-5 py-4">
      <p className="text-xs uppercase tracking-wider text-[#9a8f87] font-medium mb-1">{label}</p>
      <p className="text-xl font-semibold text-[#1a1a1a]">{value}</p>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface RawAppointment {
  id: string;
  start_datetime: string;
  status: string;
  amount_cents: number;
  amount_paid_cents: number;
  discount_cents: number;
  notes: string | null;
  services: { name: string; duration_minutes: number } | null;
  gift_cards: { code: string } | null;
  coupons: { code: string } | null;
}

interface RawClassBooking {
  id: string;
  status: string;
  amount_cents: number;
  created_at: string;
  class_sessions: {
    id: string;
    title: string;
    class_type: string;
    start_datetime: string;
    duration_minutes: number;
  } | null;
}

type HistoryRow =
  | { kind: "appointment"; data: RawAppointment }
  | { kind: "class";       data: RawClassBooking };

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [clientRes, apptsRes, classBookingsRes, intakeRes] = await Promise.all([
    supabase()
      .from("clients")
      .select("id, first_name, last_name, email, mobile, is_new_client, notes, created_at")
      .eq("id", id)
      .single(),

    supabase()
      .from("appointments")
      .select(`
        id, start_datetime, status,
        amount_cents, amount_paid_cents, discount_cents, notes,
        services ( name, duration_minutes ),
        gift_cards ( code ),
        coupons ( code )
      `)
      .eq("client_id", id)
      .order("start_datetime", { ascending: false }),

    supabase()
      .from("class_bookings")
      .select(`
        id, status, amount_cents, created_at,
        class_sessions ( id, title, class_type, start_datetime, duration_minutes )
      `)
      .eq("client_id", id)
      .order("created_at", { ascending: false }),

    supabase()
      .from("intake_forms")
      .select("id, status, submitted_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (clientRes.error || !clientRes.data) notFound();

  const client     = clientRes.data;
  const appts      = (apptsRes.data ?? []) as unknown as RawAppointment[];
  const classBks   = (classBookingsRes.data ?? []) as unknown as RawClassBooking[];
  const intakeForm = intakeRes.data as { id: string; status: string; submitted_at: string | null } | null;

  // ── Compute summary stats (completed appointments only) ───────────────────
  const completedAppts = appts.filter((a) => a.status === "completed");
  const totalVisits    = completedAppts.length;
  const totalSpent     = completedAppts.reduce((sum, a) => sum + a.amount_paid_cents, 0);

  // First/last visit across appointments + class sessions
  const allDatetimes: string[] = [
    ...appts.map((a) => a.start_datetime),
    ...classBks.map((cb) => cb.class_sessions?.start_datetime).filter(Boolean) as string[],
  ];
  const firstVisit = allDatetimes.length ? allDatetimes.reduce((a, b) => a < b ? a : b) : null;
  const lastVisit  = allDatetimes.length ? allDatetimes.reduce((a, b) => a > b ? a : b) : null;

  // ── Merge & sort appointment history newest first ─────────────────────────
  const history: HistoryRow[] = [
    ...appts.map((a) => ({ kind: "appointment" as const, data: a })),
    ...classBks.map((cb) => ({ kind: "class" as const, data: cb })),
  ].sort((a, b) => {
    const da = a.kind === "appointment"
      ? a.data.start_datetime
      : (a.data.class_sessions?.start_datetime ?? a.data.created_at);
    const db = b.kind === "appointment"
      ? b.data.start_datetime
      : (b.data.class_sessions?.start_datetime ?? b.data.created_at);
    return new Date(db).getTime() - new Date(da).getTime();
  });

  return (
    <div className="max-w-4xl">
      {/* ── Back link ──────────────────────────────────────────────────────── */}
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-1.5 text-sm text-[#7a6f68] hover:text-[#044e77] transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All clients
      </Link>

      {/* ── Header card ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8e0d8] rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl font-light">
                {client.first_name} {client.last_name}
              </h1>
              {client.is_new_client && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium
                                 bg-purple-50 text-purple-700 border border-purple-200">
                  New Client
                </span>
              )}
            </div>
            <div className="space-y-1 text-sm text-[#5a504a]">
              <p>
                <span className="text-[#9a8f87]">Email</span>{" "}
                <a href={`mailto:${client.email}`} className="hover:text-[#044e77] transition-colors">
                  {client.email}
                </a>
              </p>
              <p>
                <span className="text-[#9a8f87]">Mobile</span>{" "}
                <a href={`tel:${client.mobile}`} className="hover:text-[#044e77] transition-colors">
                  {client.mobile}
                </a>
              </p>
              <p>
                <span className="text-[#9a8f87]">Member since</span>{" "}
                {formatDate(client.created_at)}
              </p>
            </div>
            {client.notes && (
              <div className="mt-3 text-sm text-[#5a504a] bg-[#f8f5f2] rounded-lg px-3 py-2 border border-[#e8e0d8]">
                <span className="text-[#9a8f87] text-xs uppercase tracking-wider font-medium block mb-0.5">Notes</span>
                {client.notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary stats ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Visits" value={String(totalVisits)} />
        <StatCard label="Total Spent"  value={formatMoney(totalSpent)} />
        <StatCard label="First Visit"  value={formatDate(firstVisit)} />
        <StatCard label="Last Visit"   value={formatDate(lastVisit)} />
      </div>

      {/* ── Intake Form ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8e0d8] rounded-xl px-6 py-5 mb-6">
        <h2 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-xl mb-3">
          Intake Form
        </h2>
        {intakeForm ? (
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/intake/${intakeForm.id}`}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors
                ${intakeForm.status === "acknowledged"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : intakeForm.status === "submitted"
                    ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                    : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                }`}
            >
              {intakeForm.status === "acknowledged" ? "Acknowledged" : intakeForm.status === "submitted" ? "Submitted" : "Pending"}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
            {intakeForm.submitted_at && (
              <span className="text-xs text-[#9a8f87]">
                Submitted {formatDate(intakeForm.submitted_at)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-[#c0b4ab] italic">No intake form on file.</p>
        )}
      </div>

      {/* ── Appointment history ────────────────────────────────────────────── */}
      <div>
        <h2 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-xl mb-4">
          Appointment History
          <span className="text-sm font-sans font-normal not-italic text-[#9a8f87] ml-2">
            ({history.length})
          </span>
        </h2>

        {history.length === 0 ? (
          <div className="bg-white border border-[#e8e0d8] rounded-xl p-10 text-center text-[#9a8f87] text-sm">
            No appointments yet.
          </div>
        ) : (
          <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f5f2] border-b border-[#e8e0d8]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#9a8f87] font-medium">
                    Date & Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#9a8f87] font-medium">
                    Service
                  </th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden md:table-cell">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[#9a8f87] font-medium">
                    Charged
                  </th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden sm:table-cell">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden lg:table-cell">
                    Promo used
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ebe4]">
                {history.map((row) => {
                  if (row.kind === "class") {
                    const cb = row.data;
                    const session = cb.class_sessions;
                    const dt = session?.start_datetime ?? cb.created_at;
                    return (
                      <tr key={`class-${cb.id}`} className="hover:bg-[#fdfcfb]">
                        <td className="px-4 py-3 text-[#1a1a1a] whitespace-nowrap">
                          {formatDateTime(dt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium
                                             bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                              Class
                            </span>
                            <span className="text-[#1a1a1a]">
                              {session?.title ?? "Make-Up Class"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#7a6f68] hidden md:table-cell">
                          {session ? `${session.duration_minutes} min` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-[#1a1a1a]">
                          {formatMoney(cb.amount_cents)}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <StatusBadge status={cb.status} />
                        </td>
                        <td className="px-4 py-3 text-[#c0b4ab] hidden lg:table-cell">—</td>
                      </tr>
                    );
                  }

                  // Regular appointment
                  const appt = row.data;
                  const promoCode = appt.gift_cards?.code
                    ? appt.gift_cards.code
                    : appt.coupons?.code
                      ? appt.coupons.code
                      : null;

                  return (
                    <tr key={appt.id} className="hover:bg-[#fdfcfb]">
                      <td className="px-4 py-3 text-[#1a1a1a] whitespace-nowrap">
                        {formatDateTime(appt.start_datetime)}
                      </td>
                      <td className="px-4 py-3 text-[#1a1a1a]">
                        {appt.services?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[#7a6f68] hidden md:table-cell">
                        {appt.services ? `${appt.services.duration_minutes} min` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[#1a1a1a]">{formatMoney(appt.amount_paid_cents)}</span>
                        {appt.discount_cents > 0 && (
                          <div className="text-[10px] text-emerald-700 whitespace-nowrap">
                            -{formatMoney(appt.discount_cents)} discount
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <StatusBadge status={appt.status} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {promoCode ? (
                          <span className="font-mono text-xs text-[#5a504a] bg-[#f8f5f2] border border-[#e8e0d8] rounded px-1.5 py-0.5">
                            {promoCode}
                          </span>
                        ) : (
                          <span className="text-[#c0b4ab]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
