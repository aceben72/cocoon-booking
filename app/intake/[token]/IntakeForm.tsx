"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Responses {
  // Section 1 – Personal Details
  dob: string;
  address: string;
  postcode: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  silent_treatment: string;
  email_list: string;
  // Section 2 – Medical History
  medical_conditions: string[];
  other_condition: string;
  // Section 3 – Medications & Skincare
  medications: string[];
  skincare_products: string[];
  // Section 4 – Skin Profile
  skin_type: string;
  sun_exposure: string;
  skin_healing: string;
  bruises_easily: string;
  skin_concerns: string[];
  // Section 5 – General Information & Waiver
  smokes: string;
  pregnant: string;
  has_allergies: string;
  allergies_detail: string;
  advanced_treatments: string;
  treatments_detail: string;
  photo_consent: string;
}

const EMPTY: Responses = {
  dob: "",
  address: "",
  postcode: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  silent_treatment: "",
  email_list: "",
  medical_conditions: [],
  other_condition: "",
  medications: [],
  skincare_products: [],
  skin_type: "",
  sun_exposure: "",
  skin_healing: "",
  bruises_easily: "",
  skin_concerns: [],
  smokes: "",
  pregnant: "",
  has_allergies: "",
  allergies_detail: "",
  advanced_treatments: "",
  treatments_detail: "",
  photo_consent: "",
};

const TOTAL_STEPS = 5;

// ── Helper components ─────────────────────────────────────────────────────────

function TextInput({
  label,
  type = "text",
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a]
                   placeholder-[#c0b8b0] focus:outline-none focus:border-[#044e77]
                   focus:ring-1 focus:ring-[#044e77]/20 bg-white"
      />
    </div>
  );
}

function RadioGroup({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-6">
      <p className="text-sm font-medium text-[#1a1a1a] mb-3">{label}</p>
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-3 cursor-pointer group">
            <span
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                ${value === opt ? "border-[#044e77] bg-[#044e77]" : "border-[#ddd8d2] bg-white group-hover:border-[#044e77]/50"}`}
            >
              {value === opt && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <input
              type="radio"
              name={name}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="sr-only"
            />
            <span className="text-sm text-[#3a3330]">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function CheckboxGroup({
  label,
  name,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  name: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  hint?: string;
}) {
  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  }
  return (
    <div className="mb-6">
      <p className="text-sm font-medium text-[#1a1a1a] mb-1">{label}</p>
      <p className="text-xs text-[#9a8f87] mb-3">{hint ?? "Select all that apply"}</p>
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <label key={`${name}-${opt}`} className="flex items-center gap-3 cursor-pointer group">
            <span
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                ${value.includes(opt) ? "border-[#044e77] bg-[#044e77]" : "border-[#ddd8d2] bg-white group-hover:border-[#044e77]/50"}`}
            >
              {value.includes(opt) && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <input
              type="checkbox"
              name={name}
              value={opt}
              checked={value.includes(opt)}
              onChange={() => toggle(opt)}
              className="sr-only"
            />
            <span className="text-sm text-[#3a3330]">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ConditionalTextarea({
  trigger,
  label,
  placeholder,
  value,
  onChange,
}: {
  trigger: boolean;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!trigger) return null;
  return (
    <div className="ml-8 mb-6 mt-[-16px]">
      <label className="block text-xs text-[#7a6f68] mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a]
                   placeholder-[#c0b8b0] focus:outline-none focus:border-[#044e77]
                   focus:ring-1 focus:ring-[#044e77]/20 resize-none"
      />
    </div>
  );
}

// ── Signature pad ─────────────────────────────────────────────────────────────

function SignaturePad({
  onSigned,
  onCleared,
}: {
  onSigned: (data: string) => void;
  onCleared: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasStrokes = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = "#044e77";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getXY(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function handleStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    isDrawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getXY(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handleMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getXY(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStrokes.current = true;
  }

  function handleEnd(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    isDrawing.current = false;
    if (hasStrokes.current) {
      onSigned(canvasRef.current!.toDataURL("image/png"));
    }
  }

  function handleClear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
    onCleared();
  }

  return (
    <div>
      <div className="border-2 border-dashed border-[#ddd8d2] rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: 140, display: "block" }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>
      <button
        type="button"
        onClick={handleClear}
        className="mt-2 text-xs text-[#9a8f87] hover:text-[#044e77] transition-colors"
      >
        Clear signature
      </button>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function Progress({ step }: { step: number }) {
  const LABELS = ["Personal", "Medical", "Medications", "Skin", "Waiver"];
  return (
    <div className="flex items-center gap-1.5 justify-center mb-8">
      {LABELS.map((label, i) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors
                ${i + 1 < step ? "bg-[#044e77] text-white" : i + 1 === step ? "bg-[#044e77] text-white ring-4 ring-[#044e77]/20" : "bg-[#e8e0d8] text-[#9a8f87]"}`}
            >
              {i + 1 < step ? (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5l4 4 6-8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-[10px] ${i + 1 === step ? "text-[#044e77] font-medium" : "text-[#b0a499]"}`}>
              {label}
            </span>
          </div>
          {i < LABELS.length - 1 && (
            <div className={`w-6 h-0.5 mb-3.5 ${i + 1 < step ? "bg-[#044e77]" : "bg-[#e8e0d8]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IntakeForm({
  token,
  clientFirstName,
  serviceName,
  appointmentISO,
}: {
  token: string;
  clientFirstName: string;
  serviceName: string;
  appointmentISO: string;
}) {
  const [step, setStep] = useState(1);
  const [r, setR] = useState<Responses>(EMPTY);
  const [consented, setConsented] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayDate = appointmentISO
    ? new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Brisbane",
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date(appointmentISO))
    : "";

  const set = useCallback(<K extends keyof Responses>(key: K, value: Responses[K]) => {
    setR((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Validation per step ──────────────────────────────────────────────────
  function canAdvance(): boolean {
    switch (step) {
      case 1:
        return (
          !!r.dob &&
          !!r.address.trim() &&
          !!r.postcode.trim() &&
          !!r.emergency_contact_name.trim() &&
          !!r.emergency_contact_phone.trim() &&
          !!r.silent_treatment &&
          !!r.email_list
        );
      case 2:
        return r.medical_conditions.length > 0;
      case 3:
        return r.medications.length > 0 && r.skincare_products.length > 0;
      case 4:
        return (
          !!r.skin_type &&
          !!r.sun_exposure &&
          !!r.skin_healing &&
          !!r.bruises_easily &&
          r.skin_concerns.length > 0
        );
      case 5:
        return (
          !!r.smokes &&
          !!r.pregnant &&
          !!r.has_allergies &&
          !!r.advanced_treatments &&
          !!r.photo_consent &&
          consented &&
          !!signature
        );
      default:
        return false;
    }
  }

  // ── Submission ───────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canAdvance()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: r, clientSignature: signature }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Submission failed. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("An error occurred. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f8f5f2] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#e8e0d8] p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M6 16l8 8 12-14" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-[family-name:var(--font-cormorant)] italic text-2xl text-[#044e77] mb-3">
            Thank you, {clientFirstName}!
          </h1>
          <p className="text-[#7a6f68] text-sm leading-relaxed mb-2">
            Your intake form has been submitted successfully.
          </p>
          <p className="text-[#9a8f87] text-sm leading-relaxed">
            Amanda will review it before your appointment on {displayDate}. We look forward to seeing you!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f5f2]">
      {/* Header */}
      <div className="bg-[#044e77] px-4 py-5 text-center">
        <p className="text-[#a8cce0] text-xs uppercase tracking-widest mb-1">Cocoon Skin &amp; Beauty</p>
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-white text-xl">
          Facial Consultation Form
        </h1>
        {displayDate && (
          <p className="text-[#a8cce0] text-xs mt-1">{serviceName} · {displayDate}</p>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        <Progress step={step} />

        <div className="bg-white rounded-2xl border border-[#e8e0d8] px-6 py-7">

          {/* ── Step 1: Personal Details ── */}
          {step === 1 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                Personal Details
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">Please complete all fields below.</p>

              <TextInput
                label="Date of birth"
                type="date"
                value={r.dob}
                onChange={(v) => set("dob", v)}
                required
              />
              <TextInput
                label="Address"
                value={r.address}
                onChange={(v) => set("address", v)}
                required
                placeholder="Street address"
              />
              <TextInput
                label="Postcode"
                value={r.postcode}
                onChange={(v) => set("postcode", v)}
                required
                placeholder="e.g. 4209"
              />
              <TextInput
                label="Emergency contact name"
                value={r.emergency_contact_name}
                onChange={(v) => set("emergency_contact_name", v)}
                required
                placeholder="Full name"
              />
              <TextInput
                label="Emergency contact phone"
                type="tel"
                value={r.emergency_contact_phone}
                onChange={(v) => set("emergency_contact_phone", v)}
                required
                placeholder="Mobile number"
              />

              <RadioGroup
                label="Would you prefer your treatment to be silent?"
                name="silent_treatment"
                options={["Yes", "No"]}
                value={r.silent_treatment}
                onChange={(v) => set("silent_treatment", v)}
              />

              <RadioGroup
                label="Would you like to be added to our email list for news and exclusive offers?"
                name="email_list"
                options={["Yes", "No"]}
                value={r.email_list}
                onChange={(v) => set("email_list", v)}
              />
            </div>
          )}

          {/* ── Step 2: Medical History ── */}
          {step === 2 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                Medical History
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">Select any conditions that apply. If none apply, select &ldquo;None of the above&rdquo;.</p>

              <CheckboxGroup
                label="Do you have or have you had any of the following conditions?"
                name="medical_conditions"
                options={[
                  "Acne",
                  "Arthritis",
                  "Asthma",
                  "Blood disorder",
                  "Cancer",
                  "Diabetes",
                  "Epilepsy",
                  "Herpes",
                  "Hepatitis",
                  "High blood pressure",
                  "Low blood pressure",
                  "Immune disorders",
                  "Eczema",
                  "Heart condition",
                  "Warts",
                  "Lupus",
                  "Seizure disorder",
                  "Skin disease/lesions",
                  "HIV/AIDS",
                  "Insomnia",
                  "None of the above",
                ]}
                value={r.medical_conditions}
                onChange={(v) => set("medical_conditions", v)}
              />

              <div className="mb-6">
                <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">
                  Any other condition
                </label>
                <input
                  type="text"
                  value={r.other_condition}
                  onChange={(e) => set("other_condition", e.target.value)}
                  placeholder="Please describe if applicable"
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a]
                             placeholder-[#c0b8b0] focus:outline-none focus:border-[#044e77]
                             focus:ring-1 focus:ring-[#044e77]/20 bg-white"
                />
              </div>
            </div>
          )}

          {/* ── Step 3: Medications & Skincare ── */}
          {step === 3 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                Medications &amp; Skincare
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">Select all that currently apply. Choose &ldquo;None&rdquo; if nothing applies.</p>

              <CheckboxGroup
                label="Are you currently taking any of the following medications?"
                name="medications"
                options={[
                  "Tretinoin Cream",
                  "Blood thinning medication",
                  "High Blood Pressure",
                  "Cancer Treatments",
                  "Retinol",
                  "Accutane",
                  "Low Blood Pressure",
                  "Anti-Depressants",
                  "Stieva-A",
                  "Roaccutane",
                  "Anti-Anxiety",
                  "None",
                ]}
                value={r.medications}
                onChange={(v) => set("medications", v)}
              />

              <CheckboxGroup
                label="Which skincare products do you currently use?"
                name="skincare_products"
                options={[
                  "Eye Make-Up Remover",
                  "Cleansing Cream",
                  "Skin Toner/Lotion",
                  "Mask",
                  "SPF sun protection",
                  "Eye Cream",
                  "Day Cream",
                  "Night Cream",
                  "Neck lotion",
                  "Hand cream",
                  "Serums",
                  "Facial Scrub",
                  "Exfoliants",
                  "Body Lotion",
                  "Body Scrub",
                  "None",
                ]}
                value={r.skincare_products}
                onChange={(v) => set("skincare_products", v)}
              />
            </div>
          )}

          {/* ── Step 4: Skin Profile ── */}
          {step === 4 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                Skin Profile
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">Help us understand your skin so we can tailor your treatment.</p>

              <RadioGroup
                label="What is your skin type?"
                name="skin_type"
                options={["Normal", "Oily", "Dry", "Combo", "Unsure"]}
                value={r.skin_type}
                onChange={(v) => set("skin_type", v)}
              />

              <RadioGroup
                label="Your exposure to the sun?"
                name="sun_exposure"
                options={["Never", "Light", "Moderate", "Excessive"]}
                value={r.sun_exposure}
                onChange={(v) => set("sun_exposure", v)}
              />

              <RadioGroup
                label="How does your skin heal?"
                name="skin_healing"
                options={["Fast", "Slow", "Scars", "Pigments"]}
                value={r.skin_healing}
                onChange={(v) => set("skin_healing", v)}
              />

              <RadioGroup
                label="Do you get bruises easily?"
                name="bruises_easily"
                options={["No", "Yes"]}
                value={r.bruises_easily}
                onChange={(v) => set("bruises_easily", v)}
              />

              <CheckboxGroup
                label="What are your primary skin concerns?"
                name="skin_concerns"
                options={[
                  "Acne",
                  "Blackheads",
                  "Broken Capillaries",
                  "Pigmentation",
                  "Dryness/Dull Skin",
                  "Eczema",
                  "Fine lines/Wrinkles",
                  "Hyper pigmentation",
                  "Scarring",
                  "Oily Skin",
                  "Psoriasis",
                  "Redness",
                  "Sensitivity",
                  "Sun Damage",
                  "Thin Skin",
                  "Rosacea",
                ]}
                value={r.skin_concerns}
                onChange={(v) => set("skin_concerns", v)}
              />
            </div>
          )}

          {/* ── Step 5: General Information & Waiver ── */}
          {step === 5 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                General Information &amp; Waiver
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">A few final questions, then please read and sign the waiver below.</p>

              <RadioGroup
                label="Do you smoke or vape?"
                name="smokes"
                options={["Yes", "No"]}
                value={r.smokes}
                onChange={(v) => set("smokes", v)}
              />

              <RadioGroup
                label="Are you pregnant?"
                name="pregnant"
                options={["Yes", "No"]}
                value={r.pregnant}
                onChange={(v) => set("pregnant", v)}
              />

              <RadioGroup
                label="Do you have any known allergies?"
                name="has_allergies"
                options={["Yes", "No"]}
                value={r.has_allergies}
                onChange={(v) => set("has_allergies", v)}
              />
              <ConditionalTextarea
                trigger={r.has_allergies === "Yes"}
                label="Please list your allergies"
                placeholder="e.g. fragrance, nuts, latex…"
                value={r.allergies_detail}
                onChange={(v) => set("allergies_detail", v)}
              />

              <RadioGroup
                label="Have you had any advanced skin treatments in the past 4 weeks including Botox or laser treatment?"
                name="advanced_treatments"
                options={["Yes", "No"]}
                value={r.advanced_treatments}
                onChange={(v) => set("advanced_treatments", v)}
              />
              <ConditionalTextarea
                trigger={r.advanced_treatments === "Yes"}
                label="Please provide details"
                placeholder="e.g. Botox 3 weeks ago, laser resurfacing…"
                value={r.treatments_detail}
                onChange={(v) => set("treatments_detail", v)}
              />

              <RadioGroup
                label="Do you consent to photos being used on social media and/or the Cocoon website?"
                name="photo_consent"
                options={["Yes", "No"]}
                value={r.photo_consent}
                onChange={(v) => set("photo_consent", v)}
              />

              {/* Waiver */}
              <div className="mb-6 mt-2 bg-[#f8f5f2] rounded-xl p-4 border border-[#e8e0d8]">
                <p className="text-xs text-[#5a504a] leading-relaxed">
                  I confirm that the information I have provided is accurate and complete. I have not withheld any
                  information that may be relevant to my treatment or the results thereof. I am aware that there are
                  often risks associated with Beauty, Skin and Laser procedures and that the services I am about to
                  receive could have unfavourable results including but not limited to: allergic reaction, irritation,
                  redness, soreness, swelling, grazing/burning etc. I will inform COCOON SKIN AND BEAUTY of any changes
                  to the above information prior to future treatment. I understand results vary from person to person and
                  will undertake the specific aftercare and advice given to me by my COCOON SKIN AND BEAUTY consultant.
                  If I experience any reactions or responses I am to contact COCOON SKIN AND BEAUTY as soon as possible.
                  By signing below, I further agree that I will not hold COCOON SKIN AND BEAUTY OR THEIR THERAPIST
                  responsible should there be any unfavourable outcome or result.
                </p>
              </div>

              {/* Signature */}
              <div className="mb-6">
                <p className="text-sm font-medium text-[#1a1a1a] mb-1">
                  Signature <span className="text-red-500">*</span>
                </p>
                <p className="text-xs text-[#9a8f87] mb-3">Sign below using your finger or mouse</p>
                <SignaturePad
                  onSigned={setSignature}
                  onCleared={() => setSignature(null)}
                />
              </div>

              {/* Consent checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="sr-only" />
                <span
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                    ${consented ? "border-[#044e77] bg-[#044e77]" : "border-[#ddd8d2] bg-white"}`}
                  aria-hidden="true"
                >
                  {consented && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-[#5a504a] leading-relaxed">
                  I have read and agree to the waiver above, and confirm all information provided is accurate.
                </span>
              </label>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#f0ebe4]">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as typeof step)}
                className="text-sm text-[#7a6f68] hover:text-[#044e77] transition-colors"
              >
                ← Back
              </button>
            ) : (
              <span />
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as typeof step)}
                disabled={!canAdvance()}
                className="bg-[#044e77] text-white text-sm font-medium px-6 py-2.5 rounded-xl
                           hover:bg-[#033d5e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canAdvance() || submitting}
                className="bg-[#044e77] text-white text-sm font-medium px-6 py-2.5 rounded-xl
                           hover:bg-[#033d5e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting…" : "Submit Form"}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-[#b0a499] mt-6">
          Cocoon Skin &amp; Beauty · 16 Bunderoo Circuit, Pimpama QLD 4209
        </p>
      </div>
    </div>
  );
}
