import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPaymentRequest } from "@/lib/notifications";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data: appt, error } = await supabase()
    .from("appointments")
    .select(`
      status, start_datetime, payment_link_token, payment_link_token_expires_at,
      services ( name ),
      clients ( first_name, last_name, email, mobile )
    `)
    .eq("id", id)
    .single();

  if (error || !appt) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const a = appt as unknown as {
    status: string;
    start_datetime: string;
    payment_link_token: string | null;
    payment_link_token_expires_at: string | null;
    services: { name: string } | null;
    clients: { first_name: string; last_name: string; email: string; mobile: string } | null;
  };

  if (a.status !== "pending_payment" || !a.payment_link_token) {
    return NextResponse.json(
      { error: "Appointment is not awaiting payment" },
      { status: 409 },
    );
  }

  if (a.payment_link_token_expires_at && new Date(a.payment_link_token_expires_at) < new Date()) {
    return NextResponse.json({ error: "Payment link has expired" }, { status: 410 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (request.headers.get("origin") || "http://localhost:3000");

  const paymentUrl = `${appUrl}/pay/${a.payment_link_token}`;

  await sendPaymentRequest({
    serviceName: a.services?.name ?? "appointment",
    startISO:    a.start_datetime,
    paymentUrl,
    client: {
      first_name: a.clients?.first_name ?? "",
      last_name:  a.clients?.last_name  ?? "",
      email:      a.clients?.email      ?? "",
      mobile:     a.clients?.mobile     ?? "",
    },
  });

  return NextResponse.json({ success: true });
}
