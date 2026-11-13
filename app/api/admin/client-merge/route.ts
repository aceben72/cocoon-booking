import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { describeMergeMoves, oldEmailWarnings } from "@/lib/client-merge";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/client-merge?remove=<id>
// What merging that client away would move: { moves: [{ label, count }] }.
// Tables are read from the database's foreign keys, not a fixed list.
export async function GET(request: NextRequest) {
  const remove = new URL(request.url).searchParams.get("remove") ?? "";
  if (!UUID.test(remove)) {
    return NextResponse.json({ error: "Client id required" }, { status: 400 });
  }
  const { data, error } = await supabase().rpc("client_merge_preview", { p_client: remove });
  if (error) {
    console.error("[admin/client-merge] preview failed:", error);
    return NextResponse.json({ error: "Couldn't work out what would move" }, { status: 500 });
  }
  return NextResponse.json({ moves: describeMergeMoves(data ?? {}) });
}

// POST /api/admin/client-merge  { keepId, removeId, email, mobile }
// One database transaction (merge_clients): moves every row that points at
// removeId to keepId, merges notes/dates/flags, logs it in client_merges,
// then deletes removeId. Any failure leaves both clients as they were.
// Mailchimp is not touched: an old email is returned for Ben/Amanda to archive.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    keepId?: string;
    removeId?: string;
    email?: string;
    mobile?: string | null;
  };
  const { keepId, removeId, email, mobile } = body;
  if (!keepId || !removeId || !UUID.test(keepId) || !UUID.test(removeId) || keepId === removeId) {
    return NextResponse.json({ error: "Choose two different clients" }, { status: 400 });
  }
  if (!email?.trim()) {
    return NextResponse.json({ error: "Choose which email to keep" }, { status: 400 });
  }

  const ua = request.headers.get("user-agent") ?? "";
  const device = /iPhone|Android|Mobile/i.test(ua) ? "phone" : "desktop";
  const { data, error } = await supabase().rpc("merge_clients", {
    p_keep: keepId,
    p_remove: removeId,
    p_email: email,
    p_mobile: mobile?.trim() || null,
    p_merged_by: `admin (${device})`,
  });
  if (error) {
    console.error("[admin/client-merge] merge failed — nothing changed:", keepId, removeId, error);
    const friendly = error.code === "22023" ? error.message : "The merge failed and nothing was changed. Please try again.";
    return NextResponse.json({ error: friendly }, { status: error.code === "22023" ? 400 : 500 });
  }

  console.log("[admin/client-merge] merged", removeId, "into", keepId, JSON.stringify(data));
  return NextResponse.json({
    success: true,
    keptId: keepId,
    moves: describeMergeMoves(data?.moved ?? {}),
    warnings: oldEmailWarnings(data?.old_emails ?? []),
  });
}
