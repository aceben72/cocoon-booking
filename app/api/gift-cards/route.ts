import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateGiftCardCode } from "@/lib/gift-cards";
import { requireAdminAuth } from "@/lib/admin-auth";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** GET /api/gift-cards — list all gift cards (admin) */
export async function GET(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  const { data, error } = await supabase()
    .from("gift_cards")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST /api/gift-cards — create a gift card (admin) */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const {
    initial_value_cents,
    purchaser_email,
    recipient_name,
    recipient_email,
    note,
  } = body as {
    initial_value_cents?: number;
    purchaser_email?: string;
    recipient_name?: string;
    recipient_email?: string;
    note?: string;
  };

  if (!initial_value_cents || initial_value_cents <= 0) {
    return NextResponse.json({ error: "Value must be greater than $0" }, { status: 400 });
  }

  // Generate a unique code (retry up to 5 times on collision)
  let code = "";
  let attempts = 0;
  while (attempts < 5) {
    code = generateGiftCardCode();
    const { data: existing } = await supabase()
      .from("gift_cards")
      .select("id")
      .eq("code", code)
      .single();
    if (!existing) break;
    attempts++;
  }

  if (!code) {
    return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
  }

  const { data, error } = await supabase()
    .from("gift_cards")
    .insert({
      code,
      initial_value_cents,
      remaining_value_cents: initial_value_cents,
      purchaser_email: purchaser_email || null,
      recipient_name: recipient_name || null,
      recipient_email: recipient_email || null,
      note: note || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** PATCH /api/gift-cards — toggle active status by id */
export async function PATCH(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const { id, is_active } = body as { id?: string; is_active?: boolean };

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (typeof is_active !== "boolean") return NextResponse.json({ error: "is_active is required" }, { status: 400 });

  const { data, error } = await supabase()
    .from("gift_cards")
    .update({ is_active })
    .eq("id", id)
    .select("id, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
