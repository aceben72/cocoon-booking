"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface ClientRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  is_new_client: boolean;
  created_at: string;
  firstVisit: string | null;
  lastVisit: string | null;
  totalVisits: number;
  totalSpentCents: number;
}

type SortKey = "name" | "totalVisits";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <span className="ml-1 text-[#d0c8c0]">↕</span>;
  return <span className="ml-1 text-[#044e77]">{asc ? "↑" : "↓"}</span>;
}

export function ClientsTable({
  clients,
  initialQ,
}: {
  clients: ClientRow[];
  initialQ: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [q, setQ]           = useState(initialQ);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);   // null = server default (lastVisit desc)
  const [sortAsc, setSortAsc] = useState(false);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    startTransition(() => router.push(`/admin/clients?${sp.toString()}`));
  }

  function handleClear() {
    setQ("");
    startTransition(() => router.push("/admin/clients"));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === "name"); // name defaults asc; visits defaults desc
    }
  }

  // Apply client-side sort on top of the server-ordered list
  const sorted = sortKey === null
    ? clients
    : [...clients].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "name") {
          const na = `${a.last_name} ${a.first_name}`.toLowerCase();
          const nb = `${b.last_name} ${b.first_name}`.toLowerCase();
          cmp = na.localeCompare(nb);
        } else if (sortKey === "totalVisits") {
          cmp = a.totalVisits - b.totalVisits;
        }
        return sortAsc ? cmp : -cmp;
      });

  return (
    <div className="space-y-4">
      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 h-10 border border-[#ddd8d2] rounded-lg px-3 text-sm text-[#1a1a1a] bg-white
                     focus:outline-none focus:border-[#044e77] focus:ring-1 focus:ring-[#044e77]/20
                     placeholder:text-[#c0b4ab]"
        />
        <button
          type="submit"
          className="h-10 px-4 rounded-lg bg-[#044e77] text-white text-sm font-medium
                     hover:bg-[#033d5c] transition-colors"
        >
          Search
        </button>
        {initialQ && (
          <button
            type="button"
            onClick={handleClear}
            className="h-10 px-3 text-sm text-[#9a8f87] hover:text-[#1a1a1a] transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="bg-white border border-[#e8e0d8] rounded-xl p-12 text-center text-[#7a6f68]">
          {initialQ
            ? `No clients found matching "${initialQ}".`
            : "No clients yet."}
        </div>
      ) : (
        <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f5f2] border-b border-[#e8e0d8]">
              <tr>
                {/* Name — sortable */}
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => toggleSort("name")}
                    className="flex items-center gap-0.5 text-xs uppercase tracking-wider
                               text-[#9a8f87] font-medium hover:text-[#044e77] transition-colors"
                  >
                    Name
                    <SortIcon active={sortKey === "name"} asc={sortAsc} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden lg:table-cell">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden xl:table-cell">
                  Mobile
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden md:table-cell">
                  First Visit
                </th>
                {/* Total visits — sortable */}
                <th className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleSort("totalVisits")}
                    className="flex items-center gap-0.5 justify-end text-xs uppercase tracking-wider
                               text-[#9a8f87] font-medium hover:text-[#044e77] transition-colors ml-auto"
                  >
                    Visits
                    <SortIcon active={sortKey === "totalVisits"} asc={sortAsc} />
                  </button>
                </th>
                <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden sm:table-cell">
                  Total Spent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebe4]">
              {sorted.map((client) => (
                <tr
                  key={client.id}
                  className="hover:bg-[#fdfcfb] cursor-pointer"
                  onClick={() => router.push(`/admin/clients/${client.id}`)}
                >
                  {/* Name + new badge */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[#1a1a1a]">
                        {client.first_name} {client.last_name}
                      </span>
                      {client.is_new_client && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium
                                         bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                          New
                        </span>
                      )}
                    </div>
                    {/* Email visible on small screens where the column is hidden */}
                    <div className="text-xs text-[#9a8f87] mt-0.5 lg:hidden">{client.email}</div>
                  </td>
                  <td className="px-4 py-3 text-[#7a6f68] hidden lg:table-cell">{client.email}</td>
                  <td className="px-4 py-3 text-[#7a6f68] hidden xl:table-cell">{client.mobile}</td>
                  <td className="px-4 py-3 text-[#7a6f68] hidden md:table-cell">
                    {formatDate(client.firstVisit)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={client.totalVisits === 0 ? "text-[#c0b4ab]" : "font-medium text-[#1a1a1a]"}>
                      {client.totalVisits}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className={client.totalSpentCents === 0 ? "text-[#c0b4ab]" : "text-[#1a1a1a]"}>
                      {formatMoney(client.totalSpentCents)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
