import type { ReactNode } from "react";

/**
 * Short booking policy shown to clients before they pay (online booking and
 * admin payment links) and again on the confirmation screen.
 * Single source of truth for this wording — Amanda's request, 9 Nov 2026.
 * Information only: no tickbox, no validation.
 */
export const BOOKING_POLICY_HEADING = "Good to know before you book 🤍";

export const BOOKING_POLICY_POINTS = [
  "Your deposit (or payment) secures your appointment, and a deposit comes off your treatment on the day.",
  "Need to change? Give me 48 hours' notice and I'll happily move your booking.",
  "With less than 48 hours' notice, or a missed appointment, the deposit is kept.",
  "Running late? Your treatment will still finish at your booked time.",
] as const;

export default function BookingPolicyNotice({
  className = "",
  children,
}: {
  className?: string;
  /** Optional extra line(s) rendered under the policy points. */
  children?: ReactNode;
}) {
  return (
    <div
      className={[
        "bg-[#f0ebe4] rounded-xl px-5 py-4 text-sm text-[#7a6f68] font-light text-left",
        className,
      ].join(" ")}
    >
      <p className="text-[#5a504a] font-medium mb-2">{BOOKING_POLICY_HEADING}</p>
      <ul className="list-disc pl-5 space-y-1.5 leading-relaxed">
        {BOOKING_POLICY_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
