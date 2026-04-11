import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const db = supabase();

  const { data: packages, error } = await db
    .from("facial_packages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch redemptions with appointment start time for each package
  const packageIds = (packages ?? []).map((p) => p.id);

  type RedemptionRow = {
    id: string;
    facial_package_id: string;
    appointment_id: string;
    redeemed_at: string;
    appointments: { start_datetime: string } | null;
  };

  let redemptions: RedemptionRow[] = [];

  if (packageIds.length > 0) {
    const { data: redemptionRows } = await db
      .from("facial_package_redemptions")
      .select("id, facial_package_id, appointment_id, redeemed_at, appointments(start_datetime)")
      .in("facial_package_id", packageIds)
      .order("redeemed_at", { ascending: false });

    // Supabase returns joined relations as arrays; normalise to object | null
    redemptions = (redemptionRows ?? []).map((r) => ({
      id: r.id as string,
      facial_package_id: r.facial_package_id as string,
      appointment_id: r.appointment_id as string,
      redeemed_at: r.redeemed_at as string,
      appointments: Array.isArray(r.appointments)
        ? (r.appointments[0] as { start_datetime: string } | undefined) ?? null
        : (r.appointments as { start_datetime: string } | null),
    }));
  }

  // Attach redemptions to their package
  const result = (packages ?? []).map((pkg) => ({
    ...pkg,
    redemptions: redemptions.filter((r) => r.facial_package_id === pkg.id),
  }));

  return NextResponse.json(result);
}
