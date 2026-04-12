import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAuth } from "@/lib/admin-auth";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** GET /api/coupons — list all coupons with category restrictions (admin) */
export async function GET(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;
  const { data, error } = await supabase()
    .from("coupons")
    .select("*, coupon_category_restrictions(category)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** POST /api/coupons — create a coupon (admin) */
export async function POST(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const {
    code,
    type,
    value,
    max_uses,
    valid_from,
    valid_until,
    applies_to,
    categories,
  } = body as {
    code?: string;
    type?: "percentage" | "fixed";
    value?: number;
    max_uses?: number | null;
    valid_from?: string | null;
    valid_until?: string | null;
    applies_to?: "all" | "specific_categories";
    categories?: string[];
  };

  if (!code || !code.trim()) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }
  if (!type || !["percentage", "fixed"].includes(type)) {
    return NextResponse.json({ error: "Type must be 'percentage' or 'fixed'" }, { status: 400 });
  }
  if (typeof value !== "number" || value <= 0) {
    return NextResponse.json({ error: "Value must be greater than 0" }, { status: 400 });
  }
  if (type === "percentage" && value > 100) {
    return NextResponse.json({ error: "Percentage cannot exceed 100" }, { status: 400 });
  }
  if (applies_to === "specific_categories" && (!categories || categories.length === 0)) {
    return NextResponse.json({ error: "Categories are required when applies_to is specific_categories" }, { status: 400 });
  }

  const db = supabase();

  const { data: coupon, error: couponErr } = await db
    .from("coupons")
    .insert({
      code: code.trim().toUpperCase(),
      type,
      value,
      max_uses: max_uses ?? null,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
      is_active: true,
      applies_to: applies_to ?? "all",
    })
    .select("*")
    .single();

  if (couponErr) {
    const msg = couponErr.code === "23505"
      ? "A coupon with that code already exists."
      : couponErr.message;
    return NextResponse.json({ error: msg }, { status: couponErr.code === "23505" ? 409 : 500 });
  }

  // Insert category restrictions if needed
  if (applies_to === "specific_categories" && categories && categories.length > 0) {
    const restrictions = categories.map((cat) => ({ coupon_id: coupon.id, category: cat }));
    const { error: restrictErr } = await db
      .from("coupon_category_restrictions")
      .insert(restrictions);

    if (restrictErr) {
      return NextResponse.json({ error: restrictErr.message }, { status: 500 });
    }
  }

  return NextResponse.json(coupon, { status: 201 });
}
