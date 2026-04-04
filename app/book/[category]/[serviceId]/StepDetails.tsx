"use client";

import { useState } from "react";
import type { ClientDetailsForm } from "@/types";
import { isValidAustralianMobile } from "@/lib/utils";

interface Props {
  onSubmit: (details: ClientDetailsForm) => void;
  onBack: () => void;
  backLabel?: string;
  backHref?: string;
}

export default function StepDetails({ onSubmit, onBack, backLabel = "Change time", backHref }: Props) {
  const [form, setForm] = useState<ClientDetailsForm>({
    first_name: "",
    last_name: "",
    email: "",
    mobile: "",
    notes: "",
    is_new_client: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ClientDetailsForm, string>>>({});

  const update = (key: keyof ClientDetailsForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!form.first_name.trim()) newErrors.first_name = "First name is required";
    if (!form.last_name.trim()) newErrors.last_name = "Last name is required";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = "Valid email address is required";
    if (!form.mobile.trim() || !isValidAustralianMobile(form.mobile))
      newErrors.mobile = "Enter a valid Australian mobile (e.g. 0412 345 678)";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) onSubmit(form);
  };

  return (
    <div>
      {backHref ? (
        <a
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-[#7a6f68] hover:text-[#044e77] mb-6 transition-colors font-light"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {backLabel}
        </a>
      ) : (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-[#7a6f68] hover:text-[#044e77] mb-6 transition-colors font-light"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {backLabel}
        </button>
      )}

      <h2 className="font-[family-name:var(--font-cormorant)] text-3xl font-light italic text-[#044e77] mb-6">
        Your details
      </h2>

      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 flex flex-col gap-5">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="First name"
              required
              error={errors.first_name}
            >
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                placeholder="Amanda"
                className={inputClass(!!errors.first_name)}
                autoComplete="given-name"
                suppressHydrationWarning
              />
            </Field>
            <Field
              label="Last name"
              required
              error={errors.last_name}
            >
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
                placeholder="Smith"
                className={inputClass(!!errors.last_name)}
                autoComplete="family-name"
                suppressHydrationWarning
              />
            </Field>
          </div>

          {/* Email */}
          <Field label="Email address" required error={errors.email}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@example.com"
              className={inputClass(!!errors.email)}
              autoComplete="email"
              suppressHydrationWarning
            />
          </Field>

          {/* Mobile */}
          <Field
            label="Mobile number"
            required
            error={errors.mobile}
            hint="Australian mobile, e.g. 0412 345 678"
          >
            <input
              type="tel"
              value={form.mobile}
              onChange={(e) => update("mobile", e.target.value)}
              placeholder="0412 345 678"
              className={inputClass(!!errors.mobile)}
              autoComplete="tel"
              suppressHydrationWarning
            />
          </Field>

          {/* Notes */}
          <Field label="Notes / skin concerns" hint="Optional — anything Amanda should know">
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Any allergies, skin conditions, or preferences..."
              rows={3}
              className={inputClass(false) + " resize-none"}
              suppressHydrationWarning
            />
          </Field>

          {/* New client */}
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="mt-0.5">
                <input
                  type="checkbox"
                  checked={form.is_new_client}
                  onChange={(e) => update("is_new_client", e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={[
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                    form.is_new_client
                      ? "bg-[#044e77] border-[#044e77]"
                      : "bg-white border-[#d0c8c0] group-hover:border-[#044e77]",
                  ].join(" ")}
                >
                  {form.is_new_client && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-[#5a504a] font-light leading-tight pt-0.5">
                This is my first visit to Cocoon
              </span>
            </label>
            {form.is_new_client && (
              <div className="ml-8 px-4 py-3 bg-[#f0ebe4] rounded-xl border border-[#e0d8d0]">
                <p className="text-sm italic text-[#044e77] font-light leading-snug">
                  As a new client, please allow an extra 15 minutes for your initial consultation with Amanda.
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="w-full mt-5 bg-[#044e77] text-white rounded-xl py-4 px-6 font-medium
                     hover:bg-[#033d5c] active:bg-[#022d44] transition-colors"
        >
          Continue to payment
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-[#3a3330]">
        {label}
        {required && <span className="text-[#fbb040] ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-[#b0a499] font-light">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-xl border px-4 py-3 text-sm font-light text-[#1a1a1a]",
    "placeholder:text-[#c8bfb8] bg-white",
    "focus:outline-none focus:ring-2 focus:ring-[#044e77]/20 focus:border-[#044e77]",
    "transition-colors",
    hasError ? "border-red-400" : "border-[#e8e0d8] hover:border-[#c8bfb8]",
  ].join(" ");
}
