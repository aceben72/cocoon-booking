import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import IntakeAcknowledge from "./IntakeAcknowledge";

export const dynamic = "force-dynamic";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntakeResponses {
  skin_type?: string;
  skin_concerns?: string[];
  skin_sensitivity?: string;
  is_pregnant?: string;
  skin_conditions?: string[];
  takes_medications?: string;
  medications_detail?: string;
  has_allergies?: string;
  allergies_detail?: string;
  recent_procedures?: string;
  procedures_detail?: string;
  uses_spf?: string;
  active_ingredients?: string[];
  routine_description?: string;
  had_facial_before?: string;
  water_intake?: string;
  sun_exposure?: string;
  stress_level?: string;
  sleep_hours?: string;
  goals?: string;
  additional_notes?: string;
}

interface RawIntakeForm {
  id: string;
  status: string;
  submitted_at: string | null;
  consultant_signed_at: string | null;
  responses: IntakeResponses | null;
  client_signature: string | null;
  consultant_signature: string | null;
  appointments: {
    start_datetime: string;
    services: { name: string } | null;
  } | null;
  clients: {
    first_name: string;
    last_name: string;
    email: string;
    mobile: string;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function aest(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="font-[family-name:var(--font-cormorant)] italic text-lg text-[#044e77] mb-4 pb-2 border-b border-[#f0ebe4]">
        {title}
      </h3>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | string[] | undefined | null }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  const display = Array.isArray(value) ? value.join(", ") : value;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-0.5">{label}</div>
      <div className="text-sm text-[#1a1a1a]">{display}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminIntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = supabase();

  const { data, error } = await db
    .from("intake_forms")
    .select(`
      id, status, submitted_at, consultant_signed_at,
      responses, client_signature, consultant_signature,
      appointments ( start_datetime, services ( name ) ),
      clients ( first_name, last_name, email, mobile )
    `)
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  const form = data as unknown as RawIntakeForm;
  const r = form.responses ?? {};
  const client = form.clients;
  const appt = form.appointments;

  const statusLabel: Record<string, string> = {
    pending: "Pending",
    submitted: "Submitted",
    acknowledged: "Acknowledged",
  };
  const statusColour: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    submitted: "bg-blue-50 text-blue-700 border-blue-200",
    acknowledged: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl mb-1">
            Intake Form
          </h1>
          {client && (
            <p className="text-[#7a6f68] text-sm">
              {client.first_name} {client.last_name} · {appt?.services?.name ?? "Facial"}
            </p>
          )}
          {appt && (
            <p className="text-[#9a8f87] text-xs mt-0.5">{aest(appt.start_datetime)}</p>
          )}
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${statusColour[form.status] ?? ""}`}>
          {statusLabel[form.status] ?? form.status}
        </span>
      </div>

      {/* Client info */}
      {client && (
        <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-5 mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-0.5">Client</div>
            <div className="text-[#1a1a1a] font-medium">{client.first_name} {client.last_name}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-0.5">Email</div>
            <div className="text-[#1a1a1a]">{client.email}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-0.5">Mobile</div>
            <div className="text-[#1a1a1a]">{client.mobile}</div>
          </div>
          {form.submitted_at && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-0.5">Submitted</div>
              <div className="text-[#1a1a1a]">{aest(form.submitted_at)}</div>
            </div>
          )}
        </div>
      )}

      {form.status === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 mb-6 text-sm text-amber-800">
          This client has not yet submitted their intake form.
        </div>
      )}

      {(form.status === "submitted" || form.status === "acknowledged") && (
        <>
          {/* Responses */}
          <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-7 mb-6">
            <Section title="Skin Profile">
              <Row label="Skin Type" value={r.skin_type} />
              <Row label="Primary Concerns" value={r.skin_concerns} />
              <Row label="Skin Sensitivity" value={r.skin_sensitivity} />
            </Section>

            <Section title="Health & Medical">
              <Row label="Pregnant / Breastfeeding" value={r.is_pregnant} />
              <Row label="Skin Conditions" value={r.skin_conditions} />
              <Row label="Medications" value={r.takes_medications === "Yes" ? `Yes — ${r.medications_detail ?? ""}` : "No"} />
              <Row label="Allergies" value={r.has_allergies === "Yes" ? `Yes — ${r.allergies_detail ?? ""}` : "No"} />
              <Row label="Recent Facial Procedures" value={r.recent_procedures === "Yes" ? `Yes — ${r.procedures_detail ?? ""}` : "No"} />
            </Section>

            <Section title="Current Skincare Routine">
              <Row label="Uses SPF Daily" value={r.uses_spf} />
              <Row label="Active Ingredients" value={r.active_ingredients} />
              <Row label="Routine Description" value={r.routine_description} />
              <Row label="Had Professional Facial Before" value={r.had_facial_before} />
            </Section>

            <Section title="Lifestyle">
              <Row label="Daily Water Intake" value={r.water_intake} />
              <Row label="Sun Exposure" value={r.sun_exposure} />
              <Row label="Stress Level" value={r.stress_level} />
              <Row label="Sleep Per Night" value={r.sleep_hours} />
            </Section>

            <Section title="Goals">
              <Row label="Treatment Goals" value={r.goals} />
              <Row label="Additional Notes" value={r.additional_notes} />
            </Section>
          </div>

          {/* Client signature */}
          {form.client_signature && (
            <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-5 mb-6">
              <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-3">Client Signature</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.client_signature}
                alt="Client signature"
                className="max-h-24 border border-[#e8e0d8] rounded-lg p-2 bg-white"
              />
            </div>
          )}

          {/* Acknowledge / already-acknowledged */}
          {form.status === "submitted" && (
            <IntakeAcknowledge formId={id} />
          )}

          {form.status === "acknowledged" && form.consultant_signature && (
            <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-5 mb-6">
              <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-1">Consultant Signature</div>
              {form.consultant_signed_at && (
                <div className="text-xs text-[#9a8f87] mb-3">Signed {aest(form.consultant_signed_at)}</div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.consultant_signature}
                alt="Consultant signature"
                className="max-h-24 border border-[#e8e0d8] rounded-lg p-2 bg-white"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
