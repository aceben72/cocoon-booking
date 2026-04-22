"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { ClassSessionWithAvailability, ClientDetailsForm } from "@/types";
import StepDetails from "@/app/book/[category]/[serviceId]/StepDetails";
import ClassStepPayment from "./ClassStepPayment";
import ClassStepConfirmation from "./ClassStepConfirmation";
import ClassBookingProgress from "./ClassBookingProgress";

type WizardStep = "details" | "payment" | "confirmation";

export interface ClassBookingResult {
  bookingId: string;
  session: { title: string; start_datetime: string; duration_minutes: number };
  spotsRemaining: number;
  amountCents: number;
  quantity: number;
  client: { first_name: string; last_name: string; email: string };
}

interface Props {
  session: ClassSessionWithAvailability & { title: string };
  /** URL for "Back to sessions" / "Change" links. Defaults to /book/make-up-classes */
  backPath?: string;
  /** Label shown above the session title in the summary bar. Defaults to "Make-Up Classes" */
  categoryLabel?: string;
}

function formatSessionDateTime(iso: string) {
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return `${date} at ${time}`;
}

export default function ClassBookingWizard({ session, backPath = "/book/make-up-classes", categoryLabel = "Make-Up Classes" }: Props) {
  const [step, setStep] = useState<WizardStep>("details");
  const [clientDetails, setClientDetails] = useState<ClientDetailsForm | null>(null);
  const [bookingResult, setBookingResult] = useState<ClassBookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maxQuantity = session.spots_remaining as number;
  const [quantity, setQuantity] = useState(1);

  const progressStep = step === "details" ? 2 : 3;

  const handleDetailsSubmit = useCallback((details: ClientDetailsForm) => {
    setClientDetails(details);
    setStep("payment");
  }, []);

  const handlePaymentSuccess = useCallback((result: ClassBookingResult) => {
    setBookingResult(result);
    setStep("confirmation");
  }, []);

  const handleError = useCallback((msg: string) => setError(msg), []);

  return (
    <>
      {step !== "confirmation" && <ClassBookingProgress currentStep={progressStep} />}

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Session summary bar */}
        {step !== "confirmation" && (
          <div className="bg-white rounded-2xl border border-[#e8e0d8] px-5 py-4 mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-[#b0a499] font-light mb-0.5">{categoryLabel}</p>
                <h2 className="font-[family-name:var(--font-cormorant)] text-xl font-medium text-[#044e77]">
                  {session.title}
                </h2>
                <p className="text-sm text-[#9a8f87] font-light">
                  {formatSessionDateTime(session.start_datetime)} · $89/person
                </p>
              </div>
              <Link
                href={backPath}
                className="text-xs text-[#9a8f87] hover:text-[#044e77] transition-colors shrink-0"
              >
                Change
              </Link>
            </div>

            {/* Quantity selector — only editable on details step */}
            {step === "details" && (
              <div className="mt-4 pt-4 border-t border-[#f0ebe4] flex items-center justify-between">
                <span className="text-sm text-[#5a504a] font-light">Number of tickets</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="w-8 h-8 rounded-full border border-[#ddd8d2] text-[#5a504a] text-lg leading-none
                               flex items-center justify-center hover:border-[#044e77] hover:text-[#044e77]
                               disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-medium text-[#1a1a1a]">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                    disabled={quantity >= maxQuantity}
                    className="w-8 h-8 rounded-full border border-[#ddd8d2] text-[#5a504a] text-lg leading-none
                               flex items-center justify-center hover:border-[#044e77] hover:text-[#044e77]
                               disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    +
                  </button>
                  {quantity > 1 && (
                    <span className="text-sm font-medium text-[#044e77] ml-1">
                      = ${89 * quantity}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Quantity recap on payment step */}
            {step === "payment" && (
              <div className="mt-3 pt-3 border-t border-[#f0ebe4] flex items-center justify-between text-sm">
                <span className="text-[#9a8f87] font-light">Tickets</span>
                <span className="font-medium text-[#1a1a1a]">
                  {quantity} × $89 = <span className="text-[#044e77]">${89 * quantity}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {step === "details" && (
          <StepDetails
            onSubmit={handleDetailsSubmit}
            onBack={() => { /* back goes to session list */ }}
            backLabel="Back to sessions"
            backHref={backPath}
          />
        )}

        {step === "payment" && clientDetails && (
          <ClassStepPayment
            session={session}
            client={clientDetails}
            quantity={quantity}
            onSuccess={handlePaymentSuccess}
            onError={handleError}
            onBack={() => setStep("details")}
          />
        )}

        {step === "confirmation" && bookingResult && (
          <ClassStepConfirmation result={bookingResult} />
        )}
      </div>
    </>
  );
}
