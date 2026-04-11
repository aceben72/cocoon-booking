import { Suspense } from "react";
import Link from "next/link";
import BookingProgress from "@/components/BookingProgress";
import { CATEGORY_META } from "@/lib/services-data";
import DeepLinkGate from "./DeepLinkGate";

export default function SelectCategoryPage() {
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

          {/* Make-Up Classes — special card linking to session browser */}
          <Link
            href="/book/make-up-classes"
            className="group bg-white rounded-2xl border border-[#e8e0d8] p-7 flex flex-col gap-3
                       hover:border-[#fbb040] hover:shadow-md transition-all duration-200"
          >
            <div className="text-[#fbb040] text-2xl">✦</div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-medium italic text-[#044e77]
                           group-hover:text-[#033d5c] transition-colors">
              Make-Up Classes
            </h2>
            <p className="text-sm text-[#7a6f68] font-light leading-relaxed">
              Learn professional techniques in a fun, relaxed group setting.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm text-[#044e77] font-medium
                             group-hover:gap-2 transition-all">
              View sessions
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>

          {/* Facial Packages — redirect to /facial-packages */}
          <Link
            href="/facial-packages"
            className="group bg-white rounded-2xl border border-[#e8e0d8] p-7 flex flex-col gap-3
                       hover:border-[#fbb040] hover:shadow-md transition-all duration-200"
          >
            <div className="text-[#fbb040] text-2xl">✨</div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-2xl font-medium italic text-[#044e77]
                           group-hover:text-[#033d5c] transition-colors">
              Facial Packages
            </h2>
            <p className="text-sm text-[#7a6f68] font-light leading-relaxed">
              Purchase a package of four facial appointments and save — choose Indulge or Opulence.
            </p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm text-[#044e77] font-medium
                             group-hover:gap-2 transition-all">
              Purchase a package
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
