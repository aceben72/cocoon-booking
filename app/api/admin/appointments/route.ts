import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status"); // filter by status
  const from = searchParams.get("from");     // YYYY-MM-DD
  const to = searchParams.get("to");         // YYYY-MM-DD

  let query = supabase()
    .from("appointments")
    .select(`
      id, start_datetime, end_datetime, status, amount_cents, amount_paid_cents,
      square_payment_id, notes, created_at,
      services ( name, category, duration_minutes ),
      clients ( first_name, last_name, email, mobile, is_new_client )
    `)
    .order("start_datetime", { ascending: true });

  if (status && status !== "all") query = query.eq("status", status);
  query = query.neq("status", "cancelled");
  if (from) query = query.gte("start_datetime", new Date(from).toISOString());
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    query = query.lt("start_datetime", toDate.toISOString());
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
