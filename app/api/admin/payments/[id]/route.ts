import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { PaymentMethod } from "@/lib/complete-payment";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const RECLASSIFY_TO: PaymentMethod[] = ["cash", "payid_bank", "card_square", "gift_card"];

// PATCH /api/admin/payments/[id] — set the method on a backfilled payment
// whose method wasn't recorded. Only 'unknown' rows can be changed; the
// amount is untouched, so amount_paid_cents doesn't move.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { method } = await request.json().catch(() => ({})) as { method?: PaymentMethod };
  if (!method || !RECLASSIFY_TO.includes(method)) {
    return NextResponse.json({ error: "Invalid method" }, { status: 400 });
  }

  const { data, error } = await supabase()
    .from("appointment_payments")
    .update({ method, notes: "Method confirmed by Amanda" })
    .eq("id", id)
    .eq("method", "unknown")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Payment not found or already classified" }, { status: 409 });
  return NextResponse.json({ success: true });
}
