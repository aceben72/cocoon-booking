import Link from "next/link";
import { DuplicatesList } from "./DuplicatesList";

export const dynamic = "force-dynamic";

export default function DuplicatesPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl">
          Possible duplicates
        </h1>
        <Link href="/admin/clients" className="text-sm text-[#044e77] hover:underline">
          ← All clients
        </Link>
      </div>
      <p className="text-sm text-[#7a6f68] mb-6">
        Clients with the same mobile and first name, or the same full name. Merge the
        ones that are the same person; mark the rest &ldquo;Not a duplicate&rdquo; and they
        won&rsquo;t show again.
      </p>
      <DuplicatesList />
    </div>
  );
}
