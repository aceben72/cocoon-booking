import { notFound } from "next/navigation";
import Link from "next/link";
import BookingProgress from "@/components/BookingProgress";
import { CATEGORY_META, SERVICES } from "@/lib/services-data";
import { formatPrice, formatDuration } from "@/lib/utils";
import type { ServiceCategory } from "@/types";

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
    (s) => s.category === (category as ServiceCategory) && s.active,
  );

  return (
    <>
      <BookingProgress currentStep={1} />

      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Back + heading */}
        <Link
          href="/book"
          className="inline-flex items-center gap-1 text-sm text-[#7a6f68] hover:text-[#044e77] mb-8 transition-colors font-light"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All categories
        </Link>

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
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                <span className="text-[#044e77] font-medium text-lg">
                  {formatPrice(service.price_cents)}
                </span>
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
      </div>
    </>
  );
}
