import { createClient } from "@supabase/supabase-js";
import { appointmentBalanceCents, type PaymentMethod } from "@/lib/complete-payment";
import { PaymentsClient, type OwingRow, type UnknownPaymentRow, type ZeroPriceRow } from "./PaymentsClient";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

interface RawAppt {
  id: string;
  start_datetime: string;
  status: string;
  amount_cents: number;
  discount_cents: number;
  loyalty_discount_cents: number;
  cash_discount_cents: number;
  amount_paid_cents: number;
  services: { name: string; category: string; price_cents: number } | null;
  clients: { first_name: string; last_name: string } | null;
  appointment_payments: { amount_cents: number; method: PaymentMethod }[];
}

export default async function PaymentsPage() {
  const db = supabase();
  const [{ data: completed, error: apptErr }, { data: unknown, error: payErr }] = await Promise.all([
    db.from("appointments")
      .select(`
        id, start_datetime, status, amount_cents, discount_cents, loyalty_discount_cents, cash_discount_cents, amount_paid_cents,
        services ( name, category, price_cents ),
        clients ( first_name, last_name ),
        appointment_payments ( amount_cents, method )
      `)
      .eq("status", "completed")
      .order("start_datetime", { ascending: true }),
    db.from("appointment_payments")
      .select(`
        id, amount_cents, paid_at, notes,
        appointments ( start_datetime, services ( name ), clients ( first_name, last_name ) )
      `)
      .eq("method", "unknown")
      .order("paid_at", { ascending: true }),
  ]);

  if (apptErr || payErr) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-red-700">
        Failed to load payments: {(apptErr ?? payErr)!.message}
      </div>
    );
  }

  const appts = (completed ?? []) as unknown as RawAppt[];
  const name = (c: RawAppt["clients"]) => (c ? `${c.first_name} ${c.last_name}`.trim() : "—");

  // Payment owing: completed with a balance after all discounts and payments.
  const owing: OwingRow[] = appts
    .map((a) => ({ a, balance: appointmentBalanceCents(a) }))
    .filter(({ balance }) => balance > 0)
    .map(({ a, balance }) => ({
      id: a.id,
      startISO: a.start_datetime,
      client: name(a.clients),
      service: a.services?.name ?? "—",
      amountCents: a.amount_cents,
      paidCents: a.amount_paid_cents,
      paidMethods: [...new Set(a.appointment_payments.map((p) => p.method))],
      balanceCents: balance,
    }));

  // Completed at $0 although the service has a price — booked with "No charge".
  const zeroPrice: ZeroPriceRow[] = appts
    .filter((a) => a.amount_cents === 0 && (a.services?.price_cents ?? 0) > 0 && a.services?.category !== "admin-only")
    .map((a) => ({
      id: a.id,
      startISO: a.start_datetime,
      client: name(a.clients),
      service: a.services?.name ?? "—",
      servicePriceCents: a.services?.price_cents ?? 0,
    }));

  const unknownRows: UnknownPaymentRow[] = ((unknown ?? []) as unknown as {
    id: string; amount_cents: number; paid_at: string; notes: string | null;
    appointments: { start_datetime: string; services: { name: string } | null; clients: { first_name: string; last_name: string } | null } | null;
  }[]).map((p) => ({
    id: p.id,
    amountCents: p.amount_cents,
    apptStartISO: p.appointments?.start_datetime ?? p.paid_at,
    client: p.appointments?.clients ? `${p.appointments.clients.first_name} ${p.appointments.clients.last_name}`.trim() : "—",
    service: p.appointments?.services?.name ?? "—",
    notes: p.notes,
  }));

  return <PaymentsClient owing={owing} unknownPayments={unknownRows} zeroPrice={zeroPrice} />;
}
