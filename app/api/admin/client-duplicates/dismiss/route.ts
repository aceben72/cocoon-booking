import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/client-duplicates/dismiss  { clientA, clientB }
// "Not a duplicate": stores the pair (ids ordered) so it stops appearing.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { clientA?: string; clientB?: string };
  const { clientA, clientB } = body;
  if (!clientA || !clientB || !UUID.test(clientA) || !UUID.test(clientB) || clientA === clientB) {
    return NextResponse.json({ error: "Two different client ids are required" }, { status: 400 });
  }
  const { error } = await supabase().rpc("dismiss_duplicate_pair", {
    p_one: clientA,
    p_two: clientB,
    p_by: "admin",
  });
  if (error) {
    console.error("[admin/client-duplicates/dismiss] failed:", error);
    return NextResponse.json({ error: "Couldn't save that. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
