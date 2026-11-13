import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/client-duplicates          → { pairs: [...] }
// GET /api/admin/client-duplicates?count=1  → { count }  (nav badge)
// Pairs with the same mobile + first name, or the same first + last name,
// minus pairs marked "Not a duplicate" (possible_duplicate_clients()).
export async function GET(request: NextRequest) {
  const { data, error } = await supabase().rpc("possible_duplicate_clients");
  if (error) {
    console.error("[admin/client-duplicates] lookup failed:", error);
    return NextResponse.json({ error: "Couldn't load possible duplicates" }, { status: 500 });
  }
  const pairs = data ?? [];
  if (new URL(request.url).searchParams.get("count")) {
    return NextResponse.json({ count: pairs.length });
  }
  return NextResponse.json({ pairs });
}
