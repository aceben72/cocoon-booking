"use client";

/**
 * DeepLinkGate — reads ?category and ?service query params from the /book
 * root URL and redirects to the appropriate step in the booking flow.
 *
 * Mounted inside a <Suspense> boundary in app/book/page.tsx so that the
 * server-rendered category grid is never blocked.
 */

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SERVICES, CATEGORY_META } from "@/lib/services-data";

// Allow friendlier aliases from external links (e.g. WordPress) that differ
// from the internal category/service IDs used in the URL structure.
const CATEGORY_ALIASES: Record<string, string> = {
  "led-treatments":  "led-light-treatments",
  "makeup":          "make-up",
};

const SERVICE_ALIASES: Record<string, string> = {
  "personal-makeup-class": "makeup-class",
};

function resolveCategory(slug: string): string {
  return CATEGORY_ALIASES[slug] ?? slug;
}

function resolveService(slug: string): string {
  return SERVICE_ALIASES[slug] ?? slug;
}

export default function DeepLinkGate() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  useEffect(() => {
    const rawCategory = searchParams.get("category");
    const rawService  = searchParams.get("service");

    if (!rawCategory) return; // no params — normal flow

    const categoryId = resolveCategory(rawCategory);

    if (rawService) {
      // Both category + service provided — validate against SERVICES directly.
      // This handles single-service categories (e.g. mother-daughter) that have
      // no category listing page and therefore no CATEGORY_META entry.
      const serviceId = resolveService(rawService);
      const service   = SERVICES.find(
        (s) => s.id === serviceId && s.category === categoryId && s.active && !s.admin_only,
      );
      if (service) {
        // Deep-link straight into the booking wizard at date selection.
        // The `from=deeplink` marker lets BookingWizard show a "Change service → /book" link.
        router.replace(`/book/${categoryId}/${serviceId}?from=deeplink`);
      }
      // If service not found, fall through and do nothing — stay on Step 1.
      return;
    }

    // Category-only link — only valid for categories with a service listing page.
    const catMeta = CATEGORY_META.find((c) => c.id === categoryId);
    if (!catMeta) return; // unknown category — fall back to normal Step 1

    router.replace(`/book/${categoryId}`);
  }, [searchParams, router]);

  // Renders nothing — only here for the side-effect redirect.
  return null;
}
