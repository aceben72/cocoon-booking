"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Responses {
  // Section 1 – Skin Profile
  skin_type: string;
  skin_concerns: string[];
  skin_sensitivity: string;
  // Section 2 – Health & Medical
  is_pregnant: string;
  skin_conditions: string[];
  takes_medications: string;
  medications_detail: string;
  has_allergies: string;
  allergies_detail: string;
  recent_procedures: string;
  procedures_detail: string;
  // Section 3 – Current Routine
  uses_spf: string;
  active_ingredients: string[];
  routine_description: string;
  had_facial_before: string;
  // Section 4 – Lifestyle
  water_intake: string;
  sun_exposure: string;
  stress_level: string;
  sleep_hours: string;
  // Section 5 – Goals (no signature here, that's separate)
  goals: string;
  additional_notes: string;
}

const EMPTY: Responses = {
  skin_type: "",
  skin_concerns: [],
  skin_sensitivity: "",
  is_pregnant: "",
  skin_conditions: [],
  takes_medications: "",
  medications_detail: "",
  has_allergies: "",
  allergies_detail: "",
  recent_procedures: "",
  procedures_detail: "",
  uses_spf: "",
  active_ingredients: [],
  routine_description: "",
  had_facial_before: "",
  water_intake: "",
  sun_exposure: "",
  stress_level: "",
  sleep_hours: "",
  goals: "",
  additional_notes: "",
};

const TOTAL_STEPS = 5;

// ── Helper components ─────────────────────────────────────────────────────────

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
}: {
  label: string;
  name: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
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
      <p className="text-xs text-[#9a8f87] mb-3">Select all that apply</p>
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
    // Size canvas to its CSS pixel dimensions
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.strokeStyle = "#044e77";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };
    resize();
  }, []);

  function getXY(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
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
  const LABELS = ["Skin", "Health", "Routine", "Lifestyle", "Goals"];
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
        return !!r.skin_type && r.skin_concerns.length > 0 && !!r.skin_sensitivity;
      case 2:
        return (
          !!r.is_pregnant &&
          r.skin_conditions.length > 0 &&
          !!r.takes_medications &&
          !!r.has_allergies &&
          !!r.recent_procedures
        );
      case 3:
        return !!r.uses_spf && r.active_ingredients.length > 0 && !!r.routine_description && !!r.had_facial_before;
      case 4:
        return !!r.water_intake && !!r.sun_exposure && !!r.stress_level && !!r.sleep_hours;
      case 5:
        return !!r.goals.trim() && consented && !!signature;
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

          {/* ── Step 1: Skin Profile ── */}
          {step === 1 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                About Your Skin
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">Help us understand your skin so we can tailor your treatment.</p>

              <RadioGroup
                label="What is your skin type?"
                name="skin_type"
                options={["Normal", "Dry", "Oily", "Combination", "Sensitive"]}
                value={r.skin_type}
                onChange={(v) => set("skin_type", v)}
              />

              <CheckboxGroup
                label="What are your primary skin concerns?"
                name="skin_concerns"
                options={[
                  "Acne & Breakouts",
                  "Fine Lines & Wrinkles",
                  "Dullness",
                  "Uneven Skin Tone",
                  "Enlarged Pores",
                  "Redness",
                  "Dehydration",
                  "Dark Circles",
                  "Other",
                ]}
                value={r.skin_concerns}
                onChange={(v) => set("skin_concerns", v)}
              />

              <RadioGroup
                label="How sensitive is your skin?"
                name="skin_sensitivity"
                options={[
                  "Not sensitive",
                  "Slightly sensitive",
                  "Moderately sensitive",
                  "Very sensitive / reactive",
                ]}
                value={r.skin_sensitivity}
                onChange={(v) => set("skin_sensitivity", v)}
              />
            </div>
          )}

          {/* ── Step 2: Health & Medical ── */}
          {step === 2 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                Health &amp; Medical
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">This information helps ensure your treatment is safe and effective.</p>

              <RadioGroup
                label="Are you currently pregnant or breastfeeding?"
                name="is_pregnant"
                options={["No", "Pregnant", "Breastfeeding"]}
                value={r.is_pregnant}
                onChange={(v) => set("is_pregnant", v)}
              />

              <CheckboxGroup
                label="Do you have any of the following skin conditions?"
                name="skin_conditions"
                options={["Acne (active)", "Eczema", "Psoriasis", "Rosacea", "Dermatitis", "Cold Sores", "None"]}
                value={r.skin_conditions}
                onChange={(v) => set("skin_conditions", v)}
              />

              <RadioGroup
                label="Are you currently taking any medications?"
                name="takes_medications"
                options={["No", "Yes"]}
                value={r.takes_medications}
                onChange={(v) => set("takes_medications", v)}
              />
              <ConditionalTextarea
                trigger={r.takes_medications === "Yes"}
                label="Please list your medications (including Roaccutane, retinoids, antibiotics, blood thinners)"
                placeholder="e.g. Roaccutane, antibiotics…"
                value={r.medications_detail}
                onChange={(v) => set("medications_detail", v)}
              />

              <RadioGroup
                label="Do you have any known allergies?"
                name="has_allergies"
                options={["No", "Yes"]}
                value={r.has_allergies}
                onChange={(v) => set("has_allergies", v)}
              />
              <ConditionalTextarea
                trigger={r.has_allergies === "Yes"}
                label="Please list your allergies (food, environmental, skincare)"
                placeholder="e.g. fragrance, nuts, latex…"
                value={r.allergies_detail}
                onChange={(v) => set("allergies_detail", v)}
              />

              <RadioGroup
                label="Have you had any facial procedures in the last 3 months?"
                name="recent_procedures"
                options={["No", "Yes"]}
                value={r.recent_procedures}
                onChange={(v) => set("recent_procedures", v)}
              />
              <ConditionalTextarea
                trigger={r.recent_procedures === "Yes"}
                label="Please describe (e.g. injectables, laser, chemical peel)"
                placeholder="e.g. lip filler 6 weeks ago…"
                value={r.procedures_detail}
                onChange={(v) => set("procedures_detail", v)}
              />
            </div>
          )}

          {/* ── Step 3: Current Routine ── */}
          {step === 3 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                Your Current Routine
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">Tell us about how you currently care for your skin.</p>

              <RadioGroup
                label="Do you use SPF daily?"
                name="uses_spf"
                options={["Yes, daily", "Sometimes", "Rarely / No"]}
                value={r.uses_spf}
                onChange={(v) => set("uses_spf", v)}
              />

              <CheckboxGroup
                label="Which active ingredients do you currently use?"
                name="active_ingredients"
                options={[
                  "Retinol / Retinoids",
                  "Vitamin C",
                  "AHAs or BHAs (exfoliants)",
                  "Niacinamide",
                  "Benzoyl Peroxide",
                  "None",
                ]}
                value={r.active_ingredients}
                onChange={(v) => set("active_ingredients", v)}
              />

              <RadioGroup
                label="How would you describe your skincare routine?"
                name="routine_description"
                options={[
                  "Minimal — just cleanse & moisturise",
                  "Basic — cleanser, toner, moisturiser",
                  "Moderate — includes serums or actives",
                  "Comprehensive — full multi-step routine",
                ]}
                value={r.routine_description}
                onChange={(v) => set("routine_description", v)}
              />

              <RadioGroup
                label="Have you had a professional facial before?"
                name="had_facial_before"
                options={["Yes", "No"]}
                value={r.had_facial_before}
                onChange={(v) => set("had_facial_before", v)}
              />
            </div>
          )}

          {/* ── Step 4: Lifestyle ── */}
          {step === 4 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                Lifestyle
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">Your lifestyle can significantly affect your skin health.</p>

              <RadioGroup
                label="How much water do you drink per day?"
                name="water_intake"
                options={["Less than 1 litre", "1–2 litres", "More than 2 litres"]}
                value={r.water_intake}
                onChange={(v) => set("water_intake", v)}
              />

              <RadioGroup
                label="How much sun exposure do you get?"
                name="sun_exposure"
                options={[
                  "Rarely — mostly indoors",
                  "Moderate — some outdoor time",
                  "High — outdoors most days",
                ]}
                value={r.sun_exposure}
                onChange={(v) => set("sun_exposure", v)}
              />

              <RadioGroup
                label="How would you rate your current stress level?"
                name="stress_level"
                options={["Low", "Moderate", "High"]}
                value={r.stress_level}
                onChange={(v) => set("stress_level", v)}
              />

              <RadioGroup
                label="How many hours of sleep do you get per night on average?"
                name="sleep_hours"
                options={["Less than 6 hours", "6–7 hours", "8 or more hours"]}
                value={r.sleep_hours}
                onChange={(v) => set("sleep_hours", v)}
              />
            </div>
          )}

          {/* ── Step 5: Goals & Consent ── */}
          {step === 5 && (
            <div>
              <h2 className="font-[family-name:var(--font-cormorant)] italic text-xl text-[#044e77] mb-1">
                Goals &amp; Consent
              </h2>
              <p className="text-xs text-[#9a8f87] mb-6">Almost done — just a few final details.</p>

              <div className="mb-6">
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  What are your main goals for today&apos;s treatment? <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={r.goals}
                  onChange={(e) => set("goals", e.target.value)}
                  placeholder="e.g. I want to address dullness and get a brighter, more even complexion…"
                  rows={3}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a]
                             placeholder-[#c0b8b0] focus:outline-none focus:border-[#044e77]
                             focus:ring-1 focus:ring-[#044e77]/20 resize-none"
                />
              </div>

              <div className="mb-8">
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  Is there anything else you&apos;d like Amanda to know?
                </label>
                <textarea
                  value={r.additional_notes}
                  onChange={(e) => set("additional_notes", e.target.value)}
                  placeholder="Any concerns, questions, or special requests…"
                  rows={2}
                  className="w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a]
                             placeholder-[#c0b8b0] focus:outline-none focus:border-[#044e77]
                             focus:ring-1 focus:ring-[#044e77]/20 resize-none"
                />
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

              {/* Consent */}
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
                  I confirm that the information I have provided above is accurate to the best of my knowledge,
                  and I consent to this information being used to assist in my treatment at Cocoon Skin &amp; Beauty.
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
