"use client";

import { useState, useEffect, useCallback } from "react";

interface Redemption {
  id: string;
  facial_package_id: string;
  appointment_id: string;
  redeemed_at: string;
  appointments: { start_datetime: string } | null;
}

interface FacialPackage {
  id: string;
  code: string;
  package_type: "indulge" | "opulence";
  purchaser_name: string;
  purchaser_email: string;
  recipient_name: string;
  recipient_email: string;
  personal_message: string | null;
  total_uses: number;
  remaining_uses: number;
  amount_paid_cents: number;
  expires_at: string;
  created_at: string;
  redemptions: Redemption[];
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export default function FacialPackagesAdminPage() {
  const [packages, setPackages] = useState<FacialPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/facial-packages");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setPackages(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load facial packages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl">
          Facial Packages
        </h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#9a8f87]">Loading…</div>
      ) : packages.length === 0 ? (
        <div className="text-sm text-[#9a8f87]">No facial packages sold yet.</div>
      ) : (
        <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f5f2] border-b border-[#e8e0d8]">
              <tr>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Code</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden md:table-cell">Purchaser</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden md:table-cell">Recipient</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Uses</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden lg:table-cell">Expires</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden lg:table-cell">Purchased</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebe4]">
              {packages.map((pkg) => {
                const isExpired = new Date(pkg.expires_at) < new Date();
                const isUsed = pkg.remaining_uses === 0;
                const isExpanded = expandedIds.has(pkg.id);

                return (
                  <>
                    <tr
                      key={pkg.id}
                      className={`hover:bg-[#faf8f6] cursor-pointer ${isExpired || isUsed ? "opacity-60" : ""}`}
                      onClick={() => toggleExpanded(pkg.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs tracking-wider text-[#1a1a1a]">
                        {pkg.code}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={[
                          "px-2 py-0.5 rounded-full text-xs",
                          pkg.package_type === "indulge"
                            ? "bg-pink-100 text-pink-800"
                            : "bg-purple-100 text-purple-800",
                        ].join(" ")}>
                          {pkg.package_type === "indulge" ? "Indulge" : "Opulence"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#7a6f68] hidden md:table-cell">
                        <div>{pkg.purchaser_name}</div>
                        <div className="text-xs text-[#9a8f87]">{pkg.purchaser_email}</div>
                      </td>
                      <td className="px-4 py-3 text-[#7a6f68] hidden md:table-cell">
                        <div>{pkg.recipient_name}</div>
                        <div className="text-xs text-[#9a8f87]">{pkg.recipient_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={[
                          "font-medium",
                          isUsed ? "text-[#9a8f87]" : "text-emerald-700",
                        ].join(" ")}>
                          {pkg.total_uses - pkg.remaining_uses}/{pkg.total_uses}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={isExpired ? "text-red-600" : "text-[#7a6f68]"}>
                          {formatDate(pkg.expires_at)}
                          {isExpired && <span className="ml-1 text-xs">(expired)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#9a8f87] hidden lg:table-cell">
                        {formatDate(pkg.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-[#9a8f87]">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${pkg.id}-detail`} className="bg-[#faf8f6]">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-4">
                            <div>
                              <p className="text-xs uppercase tracking-wider text-[#b0a499] mb-1">Purchased</p>
                              <p className="text-[#1a1a1a]">{formatPrice(pkg.amount_paid_cents)} on {formatDate(pkg.created_at)}</p>
                            </div>
                            {pkg.personal_message && (
                              <div>
                                <p className="text-xs uppercase tracking-wider text-[#b0a499] mb-1">Personal message</p>
                                <p className="text-[#7a6f68] italic">&ldquo;{pkg.personal_message}&rdquo;</p>
                              </div>
                            )}
                          </div>

                          <p className="text-xs uppercase tracking-wider text-[#b0a499] mb-2">
                            Redemptions ({pkg.redemptions.length} of {pkg.total_uses})
                          </p>
                          {pkg.redemptions.length === 0 ? (
                            <p className="text-xs text-[#9a8f87]">No appointments booked yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {pkg.redemptions.map((r) => (
                                <div
                                  key={r.id}
                                  className="flex items-center gap-3 text-xs text-[#7a6f68] bg-white rounded-lg border border-[#e8e0d8] px-3 py-2"
                                >
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                  <span>
                                    {r.appointments?.start_datetime
                                      ? formatDateTime(r.appointments.start_datetime)
                                      : "Date unavailable"}
                                  </span>
                                  <span className="text-[#b0a499]">·</span>
                                  <span className="font-mono text-[10px] text-[#b0a499]">{r.appointment_id.slice(0, 8)}…</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
