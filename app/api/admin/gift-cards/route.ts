import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findClientGiftCards, findGiftCardByCode } from "@/lib/gift-cards";

// Admin-only (middleware guards /api/admin). Read-only.
//   ?code=GIFT-XXXX-XXXX         one card, whatever its state (problem says why it can't be used)
//   ?appointmentId=…             that appointment's client's usable cards
//   ?email=…&firstName=…&lastName=…   usable cards for a client being booked
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const code = sp.get("code");
  if (code !== null) {
    if (!code.trim()) return NextResponse.json({ error: "Enter a gift card code" }, { status: 400 });
    const card = await findGiftCardByCode(code);
    if (!card) return NextResponse.json({ error: "Gift card not found — check the code" }, { status: 404 });
    return NextResponse.json({ card });
  }

  let email = sp.get("email");
  let firstName = sp.get("firstName");
  let lastName = sp.get("lastName");

  const appointmentId = sp.get("appointmentId");
  if (appointmentId) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await db
      .from("appointments")
      .select("clients ( first_name, last_name, email )")
      .eq("id", appointmentId)
      .maybeSingle();
    const c = data?.clients as unknown as { first_name: string; last_name: string; email: string } | null;
    if (!c) return NextResponse.json({ cards: [] });
    email = c.email;
    firstName = c.first_name;
    lastName = c.last_name;
  }

  const cards = await findClientGiftCards({ email, firstName, lastName });
  return NextResponse.json({ cards });
}
