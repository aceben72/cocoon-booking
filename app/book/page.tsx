import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import BookingProgress from "@/components/BookingProgress";
import { CATEGORY_META } from "@/lib/services-data";
import { LOYALTY_OFFER_TEXT, LOYALTY_SMALL_PRINT } from "@/lib/loyalty-rules";
import DeepLinkGate from "./DeepLinkGate";

export const dynamic = "force-dynamic";

/**
 * Group classes are retired (Nov 2026) but already-scheduled sessions stay
 * bookable. Only link to the session list while one is still open to book,
 * so the card disappears once the last session has passed or filled. A
 * lookup failure hides the card rather than the page.
 */
async function hasOpenGroupSession(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const { data, error } = await createClient(url, key)
    .from("class_sessions_with_availability")
    .select("id")
    .eq("active", true)
    .in("class_type", ["masterclass", "advanced_class"])
    .gt("spots_remaining", 0)
    .gte("start_datetime", new Date().toISOString())
    .limit(1);
  if (error) console.error("[book] group session lookup failed:", error);
  return !error && (data?.length ?? 0) > 0;
}

export default async function SelectCategoryPage() {
  const showGroupClasses = await hasOpenGroupSession();
  return (
    <>
      {/* Reads ?category / ?service params and redirects when valid */}
      <Suspense fallback={null}>
        <DeepLinkGate />
      </Suspense>

      <BookingProgress currentStep={1} />

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Heading */}
        <div className="text-center mb-10">
          <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-3">
            Book an Appointment
          </h1>
          <p className="text-[#7a6f68] font-light">
            Choose a category to get started.
          </p>
        </div>

        {/* Category Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CATEGORY_META.map((cat) => (
            <Link
              key={cat.id}
              href={`/book/${cat.id}`}
              className="group bg-white rounded-2xl border border-[#e8e0d8] p-7 flex flex-col gap-3
                         hover:border-[#fbb040] hover:shadow-md transition-all duration-200"
            >
              <div className="text-[#fbb040] text-2xl">{cat.icon}</div>
              <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-medium italic text-[#044e77]
                             group-hover:text-[#033d5c] transition-colors">
                {cat.label}
              </h2>
              <p className="text-sm text-[#7a6f68] font-light leading-relaxed">
                {cat.description}
              </p>
              <span className="mt-auto inline-flex items-center gap-1 text-sm text-[#044e77] font-medium
                               group-hover:gap-2 transition-all">
                Select
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}

          {/* Group Make-Up Classes — retired; shown only while a scheduled session is still open */}
          {showGroupClasses && (
          <Link
            href="/book/make-up-classes"
            className="group bg-white rounded-2xl border border-[#e8e0d8] p-7 flex flex-col gap-3
                       hover:border-[#fbb040] hover:shadow-md transition-all duration-200"
          >
            <div className="text-[#fbb040] text-2xl">✦</div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-medium italic text-[#044e77]
                           group-hover:text-[#033d5c] transition-colors">
              Group Make-Up Classes
            </h2>
            <p className="text-sm text-[#7a6f68] font-light leading-relaxed">
              The last scheduled group sessions — book a spot while they last.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm text-[#044e77] font-medium
                             group-hover:gap-2 transition-all">
              View sessions
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
          )}

          {/* Mother & Daughter Make-Up Class — links directly to booking wizard (one service, no list step)
               Deep link: ?category=mother-daughter&service=mother-daughter-make-up-class */}
          <Link
            href="/book/mother-daughter/mother-daughter-make-up-class"
            className="group bg-white rounded-2xl border border-[#e8e0d8] p-7 flex flex-col gap-3
                       hover:border-[#fbb040] hover:shadow-md transition-all duration-200"
          >
            <div className="text-[#fbb040] text-2xl">💕</div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-medium italic text-[#044e77]
                           group-hover:text-[#033d5c] transition-colors">
              Mother &amp; Daughter Make-Up Class
            </h2>
            <p className="text-sm text-[#7a6f68] font-light leading-relaxed">
              A private two-and-a-half-hour class for mothers and daughters aged 9 to 90 in my Gainsborough Greens studio in Pimpama. $349 per pair, extra daughters $99.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm text-[#044e77] font-medium
                             group-hover:gap-2 transition-all">
              Book now
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>

          {/* Loyalty reward — replaced Facial Packages (no longer sold) */}
          <Link
            href="/book/facials"
            className="group bg-white rounded-2xl border border-[#e8e0d8] p-7 flex flex-col gap-3
                       hover:border-[#fbb040] hover:shadow-md transition-all duration-200"
          >
            <div className="text-[#fbb040] text-2xl">✨</div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-medium italic text-[#044e77]
                           group-hover:text-[#033d5c] transition-colors">
              Facial Loyalty Reward
            </h2>
            <p className="text-sm text-[#7a6f68] font-light leading-relaxed">
              {LOYALTY_OFFER_TEXT}
            </p>
            <p className="text-xs text-[#9a8f87] font-light leading-relaxed">
              {LOYALTY_SMALL_PRINT}
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm text-[#044e77] font-medium
                             group-hover:gap-2 transition-all">
              Book a facial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>

          {/* Gift Cards — redirect to /gift-cards */}
          <Link
            href="/gift-cards"
            className="group bg-white rounded-2xl border border-[#e8e0d8] p-7 flex flex-col gap-3
                       hover:border-[#fbb040] hover:shadow-md transition-all duration-200"
          >
            <div className="text-[#fbb040] text-2xl">🎁</div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-medium italic text-[#044e77]
                           group-hover:text-[#033d5c] transition-colors">
              Gift Cards
            </h2>
            <p className="text-sm text-[#7a6f68] font-light leading-relaxed">
              Give the gift of beautiful skin — redeemable for any Cocoon service.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm text-[#044e77] font-medium
                             group-hover:gap-2 transition-all">
              Purchase a gift card
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>

        {/* Tagline */}
        <p className="text-center mt-12 font-[family-name:var(--font-cormorant)] text-lg italic text-[#b0a499]">
          Relax. Revive. Restore.
        </p>
      </div>
    </>
  );
}
