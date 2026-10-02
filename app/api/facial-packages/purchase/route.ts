import { NextResponse } from "next/server";

// Facial packages are no longer sold (Oct 2026) — replaced by the facial
// loyalty reward (lib/loyalty-rules.ts). Redemption of existing packages is
// unaffected: /api/validate-facial-package and POST /api/bookings.
export async function POST() {
  return NextResponse.json(
    { error: "Facial packages are no longer available. Ask about our facial loyalty reward instead." },
    { status: 410 },
  );
}
