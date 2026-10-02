import Link from "next/link";
import { LOYALTY_OFFER_TEXT, LOYALTY_SMALL_PRINT } from "@/lib/loyalty-rules";

// Facial packages are no longer sold (Oct 2026). Existing packages are still
// redeemed in the booking flow (StepPayment → /api/validate-facial-package).
export default function FacialPackagesPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="text-5xl mb-6">✨</div>
      <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-3">
        Facial packages are no longer available
      </h1>
      <p className="text-[#7a6f68] font-light mb-3 leading-relaxed">{LOYALTY_OFFER_TEXT}</p>
      <p className="text-xs text-[#9a8f87] font-light mb-8 leading-relaxed">{LOYALTY_SMALL_PRINT}</p>
      <p className="text-sm text-[#7a6f68] font-light mb-8 leading-relaxed">
        Already have a package? You can still redeem your remaining appointments when you book an
        Indulge or Opulence Facial.
      </p>
      <Link
        href="/book/facials"
        className="inline-block rounded-xl bg-[#044e77] hover:bg-[#033d5c] text-white font-medium px-6 py-3 transition-colors"
      >
        Book a facial
      </Link>
    </div>
  );
}
