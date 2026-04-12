import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAuth } from "@/lib/admin-auth";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** PATCH /api/coupons/[id] — toggle active or update fields (admin) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { is_active } = body as { is_active?: boolean };

  if (typeof is_active !== "boolean") {
    return NextResponse.json({ error: "is_active is required" }, { status: 400 });
  }

  const { data, error } = await supabase()
    .from("coupons")
    .update({ is_active })
    .eq("id", id)
    .select("id, code, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
