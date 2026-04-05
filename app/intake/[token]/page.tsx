import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import IntakeForm from "./IntakeForm";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface RawIntakeForm {
  id: string;
  status: string;
  expires_at: string;
  appointments: {
    start_datetime: string;
    services: { name: string } | null;
  } | null;
  clients: { first_name: string; last_name: string } | null;
}

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = supabase();

  const { data, error } = await db
    .from("intake_forms")
    .select(`
      id, status, expires_at,
      appointments ( start_datetime, services ( name ) ),
      clients ( first_name, last_name )
    `)
    .eq("token", token)
    .single();

  if (error || !data) return notFound();

  const form = data as unknown as RawIntakeForm;

  if (new Date(form.expires_at) < new Date()) {
    return (
      <StatusPage
        title="Link expired"
        message="This intake form link has expired. Please contact Amanda if you need assistance."
      />
    );
  }

  if (form.status !== "pending") {
    return (
      <StatusPage
        title="Already submitted"
        message="Your intake form has already been received. We look forward to seeing you!"
      />
    );
  }

  return (
    <IntakeForm
      token={token}
      clientFirstName={form.clients?.first_name ?? ""}
      serviceName={form.appointments?.services?.name ?? "your appointment"}
      appointmentISO={form.appointments?.start_datetime ?? ""}
    />
  );
}

function StatusPage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-[#f8f5f2] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#e8e0d8] p-8 text-center">
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-2xl text-[#044e77] mb-3">
          {title}
        </h1>
        <p className="text-[#7a6f68] text-sm leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
