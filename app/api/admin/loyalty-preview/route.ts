import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SERVICES } from "@/lib/services-data";
import { aestToUTC } from "@/lib/utils";
import { getRewardForNewBooking, isLoyaltyServiceSlug } from "@/lib/loyalty";

// GET /api/admin/loyalty-preview?email=&serviceId=&date=&time= — read-only.
// Would a new admin booking get the loyalty reward? Same rules as the
// "Loyalty reward due" badge on existing bookings.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const email = sp.get("email")?.trim();
  const serviceId = sp.get("serviceId") ?? "";
  const date = sp.get("date");
  const time = sp.get("time");
  const service = SERVICES.find((s) => s.id === serviceId);
  if (!email || !date || !time || !service || !isLoyaltyServiceSlug(serviceId)) {
    return NextResponse.json({ rewardCents: 0 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const [{ data: client }, { data: dbService }] = await Promise.all([
      db.from("clients").select("id").eq("email", email).maybeSingle(),
      db.from("services").select("id").eq("name", service.name).single(),
    ]);
    if (!client || !dbService) return NextResponse.json({ rewardCents: 0 });
    const rewardCents = await getRewardForNewBooking(db, client.id as string, dbService.id as string, aestToUTC(date, time));
    return NextResponse.json({ rewardCents });
  } catch (err) {
    console.error("[admin/loyalty-preview] failed:", err);
    return NextResponse.json({ rewardCents: 0 });
  }
}
