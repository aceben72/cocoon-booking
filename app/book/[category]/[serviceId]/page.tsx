import { notFound } from "next/navigation";
import { SERVICES, CATEGORY_META } from "@/lib/services-data";
import BookingWizard from "./BookingWizard";

interface Props {
  params:       Promise<{ category: string; serviceId: string }>;
  searchParams: Promise<{ from?: string }>;
}

export default async function ServiceBookingPage({ params, searchParams }: Props) {
  const { category, serviceId } = await params;
  const { from } = await searchParams;

  const service = SERVICES.find((s) => s.id === serviceId && s.category === category);
  if (!service) notFound();

  const catMeta = CATEGORY_META.find((c) => c.id === category);

  return (
    <BookingWizard
      service={service}
      categoryLabel={catMeta?.label ?? category}
      deepLinked={from === "deeplink"}
    />
  );
}
