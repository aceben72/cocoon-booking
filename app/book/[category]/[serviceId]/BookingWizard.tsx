"use client";

import { useState, useCallback } from "react";
import type { Service, ClientDetailsForm } from "@/types";
import BookingProgress from "@/components/BookingProgress";
import StepDate from "./StepDate";
import StepTime from "./StepTime";
import StepDetails from "./StepDetails";
import StepPayment from "./StepPayment";
import StepConfirmation from "./StepConfirmation";
import { formatPrice, formatDuration, formatTime } from "@/lib/utils";
import Link from "next/link";

// Wizard steps: 2=Date, 3=Time, 4=Details, 5=Payment (confirmation is step 6 but shown as "done")
type WizardStep = 2 | 3 | 4 | 5 | 6;

interface BookingResult {
  appointmentId: string;
  service: { name: string; duration_minutes: number };
  startISO: string;
  amountCents: number;
  amountPaidCents: number;
  paidViaFacialPackage?: boolean;
  isNewClient?: boolean;
  client: { first_name: string; last_name: string; email: string };
}

interface Props {
  service: Service;
  categoryLabel: string;
  /** True when the client arrived via a ?category=…&service=… deep link */
  deepLinked?: boolean;
}

export default function BookingWizard({ service, categoryLabel, deepLinked = false }: Props) {
  const [step, setStep] = useState<WizardStep>(2);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientDetails, setClientDetails] = useState<ClientDetailsForm | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setStep(3);
  }, []);

  const handleTimeSelect = useCallback((time: string) => {
    setSelectedTime(time);
    setStep(4);
  }, []);

  const handleDetailsSubmit = useCallback((details: ClientDetailsForm) => {
    setClientDetails(details);
    setStep(5);
  }, []);

  const handlePaymentSuccess = useCallback((result: BookingResult) => {
    setBookingResult(result);
    setStep(6);
  }, []);

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  // Step 6 = confirmation (shown outside the progress bar)
  const progressStep = step === 6 ? 5 : (step - 1) as 1 | 2 | 3 | 4 | 5;

  return (
    <>
      {step < 6 && <BookingProgress currentStep={progressStep} />}

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Service summary bar (shown on steps 2-5) */}
        {step < 6 && (
          <div className="bg-white rounded-2xl border border-[#e8e0d8] px-5 py-4 mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-[#b0a499] font-light mb-0.5">{categoryLabel}</p>
              <h2 className="font-[family-name:var(--font-cormorant)] text-xl font-medium text-[#044e77]">
                {service.name}
              </h2>
              <p className="text-sm text-[#9a8f87] font-light">
                {formatDuration(service.duration_minutes)} · {formatPrice(service.price_cents)}
              </p>
            </div>
            <Link
              href={deepLinked ? "/book" : `/book/${service.category}`}
              className="text-xs text-[#9a8f87] hover:text-[#044e77] transition-colors shrink-0"
            >
              {deepLinked ? "Change service" : "Change"}
            </Link>
          </div>
        )}

        {/* Selected date/time recap (shown on steps 4+) */}
        {step >= 4 && step < 6 && selectedDate && selectedTime && (
          <div className="bg-[#f0ebe4] rounded-xl px-5 py-3 mb-6 flex items-center justify-between">
            <div className="text-sm text-[#5a504a] font-light">
              <span className="font-medium text-[#1a1a1a]">
                {formatDateDisplay(selectedDate)}
              </span>{" "}
              at{" "}
              <span className="font-medium text-[#1a1a1a]">{formatTime(selectedTime)}</span>
            </div>
            {step === 4 && (
              <button
                onClick={() => setStep(3)}
                className="text-xs text-[#9a8f87] hover:text-[#044e77] transition-colors"
              >
                Change
              </button>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        )}

        {/* Step content */}
        {step === 2 && (
          <StepDate
            service={service}
            onSelect={handleDateSelect}
          />
        )}

        {step === 3 && selectedDate && (
          <StepTime
            service={service}
            date={selectedDate}
            onSelect={handleTimeSelect}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <StepDetails
            onSubmit={handleDetailsSubmit}
            onBack={() => setStep(3)}
          />
        )}

        {step === 5 && selectedDate && selectedTime && clientDetails && (
          <StepPayment
            service={service}
            date={selectedDate}
            time={selectedTime}
            client={clientDetails}
            onSuccess={handlePaymentSuccess}
            onError={handleError}
            onBack={() => setStep(4)}
          />
        )}

        {step === 6 && bookingResult && (
          <StepConfirmation result={bookingResult} />
        )}
      </div>
    </>
  );
}

function formatDateDisplay(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
