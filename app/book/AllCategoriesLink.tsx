"use client";

import { useRouter } from "next/navigation";

/**
 * Back link to /book used on all service/session listing pages.
 * Uses router.push() rather than <Link> so that navigation is always
 * explicit and unambiguous regardless of the current route's static params.
 */
export default function AllCategoriesLink() {
  const router = useRouter();

  return (
    <a
      href="/book"
      onClick={(e) => {
        e.preventDefault();
        router.push("/book");
      }}
      className="inline-flex items-center gap-1 text-sm text-[#7a6f68] hover:text-[#044e77] mb-8 transition-colors font-light"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      All categories
    </a>
  );
}
