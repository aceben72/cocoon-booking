import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PaymentPage } from "./PaymentPage";
import { SERVICES } from "@/lib/services-data";

export const dynamic = "force-dynamic";

interface RawAppointment {
  id: string;
  start_datetime: string;
  status: string;
  amount_cents: number;
  payment_link_token_expires_at: string;
  services: { name: string; category: string; duration_minutes: number } | null;
  clients: { first_name: string; last_name: string; email: string } | null;
}

async function getAppointmentByToken(token: string): Promise<RawAppointment | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await supabase
    .from("appointments")
    .select(`
      id, start_datetime, status, amount_cents, payment_link_token_expires_at,
      services ( name, category, duration_minutes ),
      clients ( first_name, last_name, email )
    `)
    .eq("payment_link_token", token)
    .single();

  return data as RawAppointment | null;
}

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const appt = await getAppointmentByToken(token);

  // Token not found
  if (!appt) notFound();

  // Already paid
  if (appt.status === "confirmed") {
    return (
      <main className="min-h-screen bg-[#f8f5f2] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#e8e0d8] p-10 text-center">
          <p className="text-4xl mb-4">✨</p>
          <h1 className="font-[family-name:var(--font-cormorant)] italic text-2xl text-[#044e77] mb-3">
            Already confirmed
          </h1>
          <p className="text-sm text-[#7a6f68]">
            This booking has already been paid and confirmed. See you soon!
          </p>
        </div>
      </main>
    );
  }

  // Not awaiting payment (cancelled, etc.)
  if (appt.status !== "pending_payment") {
    return (
      <main className="min-h-screen bg-[#f8f5f2] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#e8e0d8] p-10 text-center">
          <h1 className="font-[family-name:var(--font-cormorant)] italic text-2xl text-[#044e77] mb-3">
            Link unavailable
          </h1>
          <p className="text-sm text-[#7a6f68]">
            This payment link is no longer active. Please contact Amanda.
          </p>
        </div>
      </main>
    );
  }

  // Expired
  if (new Date(appt.payment_link_token_expires_at) < new Date()) {
    return (
      <main className="min-h-screen bg-[#f8f5f2] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#e8e0d8] p-10 text-center">
          <h1 className="font-[family-name:var(--font-cormorant)] italic text-2xl text-[#044e77] mb-3">
            Link expired
          </h1>
          <p className="text-sm text-[#7a6f68]">
            This payment link has expired. Please contact Amanda to receive a new one.
          </p>
        </div>
      </main>
    );
  }

  // Match service from local data for category (deposit rules)
  const localService = SERVICES.find((s) => s.name === appt.services?.name);

  return (
    <main className="min-h-screen bg-[#f8f5f2]">
      <PaymentPage
        token={token}
        appointmentId={appt.id}
        serviceName={appt.services?.name ?? ""}
        serviceCategory={appt.services?.category ?? localService?.category ?? ""}
        priceCents={appt.amount_cents}
        startISO={appt.start_datetime}
        clientFirstName={appt.clients?.first_name ?? ""}
        clientLastName={appt.clients?.last_name ?? ""}
        clientEmail={appt.clients?.email ?? ""}
      />
    </main>
  );
}
