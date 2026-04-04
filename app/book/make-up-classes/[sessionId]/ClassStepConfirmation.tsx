"use client";

import Link from "next/link";
import Image from "next/image";
import type { ClassBookingResult } from "./ClassBookingWizard";

interface Props {
  result: ClassBookingResult;
}

export default function ClassStepConfirmation({ result }: Props) {
  const { session, spotsRemaining, amountCents, quantity, client } = result;

  const displayDate = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(session.start_datetime));

  const displayTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(session.start_datetime));

  const price = `$${(amountCents / 100).toFixed(0)}`;
  const hours = Math.floor(session.duration_minutes / 60);
  const mins  = session.duration_minutes % 60;
  const duration = mins ? `${hours} hr ${mins} min` : `${hours} hours`;
  const ticketLabel = quantity === 1 ? "1 ticket" : `${quantity} tickets`;

  return (
    <div className="text-center">
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

      <div className="w-16 h-16 bg-[#044e77] rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-2">
        You&rsquo;re booked in!
      </h1>
      <p className="text-[#7a6f68] font-light mb-8">
        Hi {client.first_name}, a confirmation has been sent to{" "}
        <span className="font-medium text-[#1a1a1a]">{client.email}</span>
      </p>

      <div className="bg-white rounded-2xl border border-[#e8e0d8] p-6 text-left mb-8">
        <h2 className="text-xs uppercase tracking-wider text-[#b0a499] font-light mb-5">
          Booking details
        </h2>
        <div className="space-y-4">
          {[
            { label: "Class",    value: session.title },
            { label: "Tickets",  value: ticketLabel },
            { label: "Duration", value: duration },
            { label: "Date",     value: displayDate },
            { label: "Time",     value: displayTime },
            { label: "Location", value: "Pimpama, QLD", note: "Full address in your confirmation SMS" },
          ].map(({ label, value, note }) => (
            <div key={label} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-[#9a8f87] font-light shrink-0">{label}</span>
              <div className="text-right">
                <span className="text-[#1a1a1a] font-light">{value}</span>
                {note && <p className="text-xs text-[#b0a499] font-light mt-0.5">{note}</p>}
              </div>
            </div>
          ))}
          <div className="pt-4 border-t border-[#f0ebe4] flex items-center justify-between">
            <span className="text-sm font-medium text-[#3a3330]">Paid</span>
            <span className="text-xl font-[family-name:var(--font-cormorant)] font-medium text-[#044e77]">
              {price}
            </span>
          </div>
        </div>
      </div>

      {spotsRemaining > 0 && (
        <div className="bg-[#f0ebe4] rounded-xl px-5 py-3 text-sm text-[#7a6f68] font-light text-left mb-6">
          <span className="font-medium text-[#5a504a]">
            {spotsRemaining} spot{spotsRemaining !== 1 ? "s" : ""} remaining
          </span>{" "}
          in this session — perfect for a friend or family member!
        </div>
      )}

      <div className="bg-[#f0ebe4] rounded-xl px-5 py-4 text-sm text-[#7a6f68] font-light text-left mb-8">
        <strong className="text-[#5a504a] font-medium">Cancellation policy:</strong>{" "}
        Please provide at least 48 hours notice if you need to cancel.
        Contact Amanda directly to make any changes.
      </div>

      <Link href="/book" className="inline-block text-sm text-[#044e77] font-medium hover:underline">
        Make another booking
      </Link>

      <p className="font-[family-name:var(--font-cormorant)] text-lg italic text-[#b0a499] mt-10">
        Relax. Revive. Restore.
      </p>
    </div>
  );
}
