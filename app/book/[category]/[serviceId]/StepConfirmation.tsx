"use client";

import Link from "next/link";
import { formatPrice, formatDuration } from "@/lib/utils";
import Image from "next/image";

interface BookingResult {
  appointmentId: string;
  service: { name: string; duration_minutes: number };
  startISO: string;
  amountCents: number;
  amountPaidCents: number;
  isNewClient?: boolean;
  client: { first_name: string; last_name: string; email: string };
}

interface Props {
  result: BookingResult;
}

export default function StepConfirmation({ result }: Props) {
  const { service, startISO, amountCents, amountPaidCents, client, isNewClient } = result;
  const hasOutstanding = amountPaidCents < amountCents;

  const displayDate = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(startISO));

  const displayTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(startISO));

  return (
    <div className="text-center">
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <Image
          src="https://mcusercontent.com/644ef8c7fbae49e3b1826dda3/images/1b7a3cb7-18c0-682d-62bf-921900b53c86.png"
          alt="Cocoon Skin & Beauty"
          width={100}
          height={42}
          className="h-10 w-auto object-contain opacity-80"
          unoptimized
        />
      </div>

      {/* Success icon */}
      <div className="w-16 h-16 bg-[#044e77] rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-2">
        You&rsquo;re all booked!
      </h1>
      <p className="text-[#7a6f68] font-light mb-8">
        Hi {client.first_name}, a confirmation has been sent to{" "}
        <span className="font-medium text-[#1a1a1a]">{client.email}</span>
      </p>

      {/* Booking details card */}
      <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 text-left mb-8">
        <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-5">
          Appointment details
        </h2>
        <div className="space-y-4">
          <DetailRow label="Service" value={service.name} />
          <DetailRow label="Duration" value={formatDuration(service.duration_minutes)} />
          <DetailRow label="Date" value={displayDate} />
          <DetailRow label="Time" value={displayTime} />
          <DetailRow label="Location" value="16 Bunderoo Circuit, Pimpama QLD 4209" note="Cocoon Skin & Beauty" />
          <div className="pt-4 border-t border-[#f0ebe4] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#3a3330]">
                {hasOutstanding ? "Deposit paid" : "Paid"}
              </span>
              <span className="text-xl font-[family-name:var(--font-cormorant)] font-medium text-[#044e77]">
                {formatPrice(amountPaidCents)}
              </span>
            </div>
            {hasOutstanding && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#9a8f87] font-light">Balance due at appointment</span>
                <span className="text-[#9a8f87] font-light">
                  {formatPrice(amountCents - amountPaidCents)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New client extra-time note */}
      {isNewClient && (
        <div className="bg-[#f0ebe4] rounded-xl px-5 py-4 text-sm text-left mb-4 border border-[#e0d8d0]">
          <p className="italic text-[#044e77] font-light leading-relaxed">
            As a new client, please allow an extra 15 minutes for your initial consultation with Amanda.
          </p>
        </div>
      )}

      {/* Cancellation / balance note */}
      <div className="bg-[#f0ebe4] rounded-xl px-5 py-4 text-sm text-[#7a6f68] font-light text-left mb-8 space-y-2">
        {hasOutstanding && (
          <p>
            <strong className="text-[#5a504a] font-medium">Balance reminder:</strong>{" "}
            The remaining {formatPrice(amountCents - amountPaidCents)} is payable at your appointment.
          </p>
        )}
        <p>
          <strong className="text-[#5a504a] font-medium">Cancellation policy:</strong>{" "}
          Please provide at least 48 hours notice if you need to cancel or reschedule.
          Contact Amanda directly to make any changes.
        </p>
      </div>

      {/* Actions */}
      <Link
        href="/book"
        className="inline-block text-sm text-[#044e77] font-medium hover:underline"
      >
        Make another booking
      </Link>

      {/* Tagline */}
      <p className="font-[family-name:var(--font-cormorant)] text-lg italic text-[#b0a499] mt-10">
        Relax. Revive. Restore.
      </p>
    </div>
  );
}

function DetailRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-[#9a8f87] font-light shrink-0">{label}</span>
      <div className="text-right">
        <span className="text-[#1a1a1a] font-light">{value}</span>
        {note && <p className="text-xs text-[#b0a499] font-light mt-0.5">{note}</p>}
      </div>
    </div>
  );
}
