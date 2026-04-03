import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const { data, error } = await supabase()
    .from("blocked_periods")
    .select("id, start_datetime, end_datetime, reason")
    .order("start_datetime", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { start_datetime, end_datetime, reason } = body as {
    start_datetime?: string;
    end_datetime?: string;
    reason?: string;
  };

  if (!start_datetime || !end_datetime) {
    return NextResponse.json({ error: "start_datetime and end_datetime are required" }, { status: 400 });
  }
  if (new Date(end_datetime) <= new Date(start_datetime)) {
    return NextResponse.json({ error: "end_datetime must be after start_datetime" }, { status: 400 });
  }

  const { data, error } = await supabase()
    .from("blocked_periods")
    .insert({ start_datetime, end_datetime, reason: reason || null })
    .select("id, start_datetime, end_datetime, reason")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
