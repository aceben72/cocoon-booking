import { notFound } from "next/navigation";
import Link from "next/link";
import BookingProgress from "@/components/BookingProgress";
import { CATEGORY_META, SERVICES } from "@/lib/services-data";
import { formatPrice, formatDuration, cashSavingText, CASH_SAVING_NOTE } from "@/lib/utils";
import type { ServiceCategory } from "@/types";
import AllCategoriesLink from "../AllCategoriesLink";

interface Props {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  return CATEGORY_META.map((c) => ({ category: c.id }));
}

export default async function SelectServicePage({ params }: Props) {
  const { category } = await params;
  const meta = CATEGORY_META.find((c) => c.id === category);
  if (!meta) notFound();

  const services = SERVICES.filter(
    (s) => s.category === (category as ServiceCategory) && s.active && !s.admin_only,
  );

  return (
    <>
      <BookingProgress currentStep={1} />

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Back + heading */}
        <AllCategoriesLink />

        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-2">
            {meta.label}
          </h1>
          <p className="text-[#7a6f68] font-light text-sm">{meta.description}</p>
        </div>

        {/* Service list */}
        <div className="flex flex-col gap-3">
          {services.map((service) => (
            <Link
              key={service.id}
              href={`/book/${category}/${service.id}`}
              className="group bg-white rounded-2xl border border-[#e8e0d8] px-6 py-5
                         flex items-center justify-between
                         hover:border-[#fbb040] hover:shadow-md transition-all duration-200"
            >
              <div>
                <h2 className="font-[family-name:var(--font-cormorant)] text-xl font-medium text-[#1a1a1a]
                               group-hover:text-[#044e77] transition-colors">
                  {service.name}
                </h2>
                <p className="text-sm text-[#9a8f87] font-light mt-0.5">
                  {formatDuration(service.duration_minutes)}
                </p>
                {service.description && (
                  <p className="text-xs text-[#b0a499] font-light mt-1.5 max-w-sm">
                    {service.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                <div className="text-right">
                  <span className="text-[#044e77] font-medium text-lg">
                    {formatPrice(service.price_cents)}
                  </span>
                  {cashSavingText(service.price_cents, service.cash_price_cents) && (
                    <p className="text-xs text-[#9a8f87] font-light mt-0.5 max-w-[11rem]">
                      {cashSavingText(service.price_cents, service.cash_price_cents)}
                    </p>
                  )}
                </div>
                <svg
                  className="w-5 h-5 text-[#c8bfb8] group-hover:text-[#fbb040] transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-sm text-[#7a6f68] font-light text-center mt-8 leading-relaxed">
          {CASH_SAVING_NOTE}
        </p>
      </div>
    </>
  );
}
