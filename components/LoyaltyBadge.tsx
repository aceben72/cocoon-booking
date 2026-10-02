import type { AppointmentLoyalty } from "@/lib/loyalty-rules";
import { LOYALTY_FACIALS_REQUIRED } from "@/lib/loyalty-rules";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

/** Admin label for a booking's loyalty state, e.g. "Loyalty reward due: $50 off". */
export function loyaltyLabel(l: AppointmentLoyalty): string {
  switch (l.kind) {
    case "due":
      return `Loyalty reward due: ${dollars(l.amountCents)} off`;
    case "applied":
      return `Loyalty reward applied: −${dollars(l.amountCents)}`;
    case "progress":
      return `Loyalty: ${l.count} of ${LOYALTY_FACIALS_REQUIRED} facials completed`;
    case "counted":
      return l.position <= LOYALTY_FACIALS_REQUIRED
        ? `Loyalty facial ${l.position} of ${LOYALTY_FACIALS_REQUIRED}`
        : `Loyalty facial ${l.position}`;
  }
}

export function LoyaltyBadge({ loyalty, className = "" }: { loyalty: AppointmentLoyalty | null | undefined; className?: string }) {
  if (!loyalty) return null;
  const tone =
    loyalty.kind === "due"
      ? "bg-amber-50 text-amber-800 border-amber-300 font-semibold"
      : loyalty.kind === "applied"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-[#f8f5f2] text-[#7a6f68] border-[#e8e0d8]";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${tone} ${className}`}>
      {loyaltyLabel(loyalty)}
    </span>
  );
}
