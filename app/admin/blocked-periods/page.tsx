import { createClient } from "@supabase/supabase-js";
import { BlockedPeriodsManager } from "./BlockedPeriodsManager";

export const dynamic = "force-dynamic";

interface BlockedPeriod {
  id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
}

async function getBlockedPeriods(): Promise<BlockedPeriod[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("blocked_periods")
    .select("id, start_datetime, end_datetime, reason")
    .order("start_datetime", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BlockedPeriod[];
}

export default async function BlockedPeriodsPage() {
  let periods: BlockedPeriod[] = [];
  let fetchError = "";

  try {
    periods = await getBlockedPeriods();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load blocked periods";
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl mb-6">
        Blocked Periods
      </h1>
      <p className="text-sm text-[#7a6f68] mb-6">
        Block out dates and times when no bookings should be accepted — holidays, training days, or
        personal leave. Blocked periods hide those time slots from clients.
      </p>

      {fetchError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {fetchError}
        </div>
      ) : (
        <BlockedPeriodsManager periods={periods} />
      )}
    </div>
  );
}
