"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Count of undismissed possible-duplicate pairs, linking to the list.
// Hidden when there are none, or if the lookup fails (e.g. before the migration).
export function DuplicatesBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch("/api/admin/client-duplicates?count=1", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((d: { count?: number }) => setCount(d.count ?? 0))
        .catch(() => setCount(0));
    void load();
    window.addEventListener("client-duplicates-changed", load);
    return () => window.removeEventListener("client-duplicates-changed", load);
  }, []);

  if (count === 0) return null;
  return (
    <Link
      href="/admin/clients/duplicates"
      title={`${count} possible duplicate client${count === 1 ? "" : "s"}`}
      className="-ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-[#044e77] text-[11px] font-semibold hover:bg-amber-300"
    >
      {count}
    </Link>
  );
}
