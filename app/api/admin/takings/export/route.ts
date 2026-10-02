import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseQuarterKey, quarterKey, takingsCsv } from "@/lib/takings";
import { loadTakings } from "@/lib/takings-data";

// GET /api/admin/takings/export?quarter=2027-Q2 — CSV download.
export async function GET(request: NextRequest) {
  const quarter = parseQuarterKey(request.nextUrl.searchParams.get("quarter"));
  if (!quarter) return NextResponse.json({ error: "quarter=YYYY-Q1..Q4 required" }, { status: 400 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const csv = takingsCsv(await loadTakings(db, quarter));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cocoon-takings-FY${quarterKey(quarter)}.csv"`,
    },
  });
}
