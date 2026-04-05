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
  // Section 1
  dob?: string;
  address?: string;
  postcode?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  silent_treatment?: string;
  email_list?: string;
  // Section 2
  medical_conditions?: string[];
  other_condition?: string;
  // Section 3
  medications?: string[];
  skincare_products?: string[];
  // Section 4
  skin_type?: string;
  sun_exposure?: string;
  skin_healing?: string;
  bruises_easily?: string;
  skin_concerns?: string[];
  // Section 5
  smokes?: string;
  pregnant?: string;
  has_allergies?: string;
  allergies_detail?: string;
  advanced_treatments?: string;
  treatments_detail?: string;
  photo_consent?: string;
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

// ── Display helpers ───────────────────────────────────────────────────────────

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

function SectionHeading({ title }: { title: string }) {
  return (
    <h3 className="font-[family-name:var(--font-cormorant)] italic text-lg text-[#044e77]
                   mb-4 pb-2 border-b border-[#f0ebe4]">
      {title}
    </h3>
  );
}

/** Single labelled field — radio answer or free text. */
function Field({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-1">{label}</div>
      <div className="text-sm text-[#1a1a1a]">
        {value ? value : <span className="text-[#c0b8b0] italic">Not provided</span>}
      </div>
    </div>
  );
}

/** Checkbox group — shows every option, ticked or unticked. */
function CheckList({
  label,
  options,
  selected,
}: {
  label: string;
  options: string[];
  selected: string[] | undefined;
}) {
  const ticked = new Set(selected ?? []);
  return (
    <div className="mb-5">
      <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-2">{label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {options.map((opt) => {
          const checked = ticked.has(opt);
          return (
            <div key={opt} className={`flex items-center gap-2 text-sm ${checked ? "text-[#1a1a1a]" : "text-[#c0b8b0]"}`}>
              {checked ? (
                <span className="w-4 h-4 rounded bg-[#044e77] flex items-center justify-center shrink-0">
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              ) : (
                <span className="w-4 h-4 rounded border border-[#e0d8d0] bg-[#faf8f6] shrink-0" />
              )}
              {opt}
            </div>
          );
        })}
      </div>
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

      {/* ── Header ── */}
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

      {/* ── Client meta ── */}
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

      {/* ── Pending notice ── */}
      {form.status === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 mb-6 text-sm text-amber-800">
          This client has not yet submitted their intake form.
        </div>
      )}

      {(form.status === "submitted" || form.status === "acknowledged") && (
        <>
          {/* ── Responses ── */}
          <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-7 mb-6">

            {/* Section 1 — Personal Details */}
            <SectionHeading title="Personal Details" />
            <Field label="Date of birth" value={r.dob} />
            <Field label="Address" value={r.address} />
            <Field label="Postcode" value={r.postcode} />
            <Field label="Emergency contact name" value={r.emergency_contact_name} />
            <Field label="Emergency contact phone" value={r.emergency_contact_phone} />
            <Field label="Silent treatment preferred" value={r.silent_treatment} />
            <Field label="Added to email list" value={r.email_list} />

            {/* Section 2 — Medical History */}
            <div className="mt-8">
              <SectionHeading title="Medical History" />
              <CheckList
                label="Conditions"
                options={[
                  "Acne", "Arthritis", "Asthma", "Blood disorder", "Cancer",
                  "Diabetes", "Epilepsy", "Herpes", "Hepatitis", "High blood pressure",
                  "Low blood pressure", "Immune disorders", "Eczema", "Heart condition",
                  "Warts", "Lupus", "Seizure disorder", "Skin disease/lesions", "HIV/AIDS",
                  "Insomnia", "None of the above",
                ]}
                selected={r.medical_conditions}
              />
              <Field label="Any other condition" value={r.other_condition} />
            </div>

            {/* Section 3 — Medications & Skincare */}
            <div className="mt-8">
              <SectionHeading title="Medications &amp; Skincare" />
              <CheckList
                label="Current medications"
                options={[
                  "Tretinoin Cream", "Blood thinning medication", "High Blood Pressure",
                  "Cancer Treatments", "Retinol", "Accutane", "Low Blood Pressure",
                  "Anti-Depressants", "Stieva-A", "Roaccutane", "Anti-Anxiety", "None",
                ]}
                selected={r.medications}
              />
              <CheckList
                label="Skincare products used"
                options={[
                  "Eye Make-Up Remover", "Cleansing Cream", "Skin Toner/Lotion", "Mask",
                  "SPF sun protection", "Eye Cream", "Day Cream", "Night Cream",
                  "Neck lotion", "Hand cream", "Serums", "Facial Scrub",
                  "Exfoliants", "Body Lotion", "Body Scrub", "None",
                ]}
                selected={r.skincare_products}
              />
            </div>

            {/* Section 4 — Skin Profile */}
            <div className="mt-8">
              <SectionHeading title="Skin Profile" />
              <Field label="Skin type" value={r.skin_type} />
              <Field label="Sun exposure" value={r.sun_exposure} />
              <Field label="How skin heals" value={r.skin_healing} />
              <Field label="Bruises easily" value={r.bruises_easily} />
              <CheckList
                label="Skin concerns"
                options={[
                  "Acne", "Blackheads", "Broken Capillaries", "Pigmentation",
                  "Dryness/Dull Skin", "Eczema", "Fine lines/Wrinkles", "Hyper pigmentation",
                  "Scarring", "Oily Skin", "Psoriasis", "Redness",
                  "Sensitivity", "Sun Damage", "Thin Skin", "Rosacea",
                ]}
                selected={r.skin_concerns}
              />
            </div>

            {/* Section 5 — General Information & Waiver */}
            <div className="mt-8">
              <SectionHeading title="General Information &amp; Waiver" />
              <Field label="Smokes or vapes" value={r.smokes} />
              <Field label="Pregnant" value={r.pregnant} />
              <Field
                label="Known allergies"
                value={
                  r.has_allergies === "Yes"
                    ? `Yes${r.allergies_detail ? ` — ${r.allergies_detail}` : ""}`
                    : r.has_allergies
                }
              />
              <Field
                label="Advanced skin treatments in past 4 weeks"
                value={
                  r.advanced_treatments === "Yes"
                    ? `Yes${r.treatments_detail ? ` — ${r.treatments_detail}` : ""}`
                    : r.advanced_treatments
                }
              />
              <Field label="Photo consent (social media / website)" value={r.photo_consent} />
            </div>
          </div>

          {/* ── Client signature ── */}
          {form.client_signature && (
            <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-5 mb-6">
              <div className="text-xs uppercase tracking-wider text-[#9a8f87] mb-1">Client Signature</div>
              {form.submitted_at && (
                <div className="text-xs text-[#9a8f87] mb-3">Signed {aest(form.submitted_at)}</div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.client_signature}
                alt="Client signature"
                className="max-h-28 border border-[#e8e0d8] rounded-lg p-2 bg-white"
              />
            </div>
          )}

          {/* ── Acknowledge (submitted) / Consultant signature (acknowledged) ── */}
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
                className="max-h-28 border border-[#e8e0d8] rounded-lg p-2 bg-white"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
