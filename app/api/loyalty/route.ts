import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { aestToUTC } from "@/lib/utils";
import { getLoyaltyStatusByEmail, isLoyaltyServiceSlug, LOYALTY_REWARD_CENTS } from "@/lib/loyalty";

/**
 * Read-only: does this booking get the loyalty reward? Returns only the
 * reward amount — never the client's count — since anyone can type an email.
 * POST /api/bookings re-checks this server-side before charging.
 */
export async function POST(request: NextRequest) {
  const { email, serviceId, date, time } = (await request.json().catch(() => ({}))) as {
    email?: string;
    serviceId?: string;
    date?: string; // YYYY-MM-DD AEST
    time?: string; // HH:MM AEST
  };

  if (!email || !serviceId || !date || !time || !isLoyaltyServiceSlug(serviceId)) {
    return NextResponse.json({ rewardCents: 0 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const status = await getLoyaltyStatusByEmail(db, email, aestToUTC(date, time));
    return NextResponse.json({ rewardCents: status?.rewardDue ? LOYALTY_REWARD_CENTS : 0 });
  } catch (err) {
    console.error("[loyalty] status lookup failed:", err);
    return NextResponse.json({ rewardCents: 0 });
  }
}
