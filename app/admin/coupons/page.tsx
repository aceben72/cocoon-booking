"use client";

import { useState, useEffect, useCallback } from "react";

const CATEGORIES = [
  { value: "brow-treatments", label: "Brow Treatments" },
  { value: "facials", label: "Facials" },
  { value: "led-light-treatments", label: "LED Light Treatments" },
  { value: "make-up", label: "Make-Up" },
];

interface Coupon {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  applies_to: "all" | "specific_categories";
  coupon_category_restrictions: { category: string }[];
  created_at: string;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(y, m - 1, d),
  );
}

function formatCouponValue(coupon: Coupon) {
  return coupon.type === "percentage"
    ? `${coupon.value}% off`
    : `${formatPrice(coupon.value)} off`;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [appliesTo, setAppliesTo] = useState<"all" | "specific_categories">("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/coupons");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setCoupons(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load coupons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const resetForm = () => {
    setCode("");
    setType("percentage");
    setValue("");
    setMaxUses("");
    setValidFrom("");
    setValidUntil("");
    setAppliesTo("all");
    setSelectedCategories([]);
    setCreateError("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setCreateError("Code is required."); return; }

    const numValue = parseFloat(value);
    if (!numValue || numValue <= 0) { setCreateError("Value must be greater than 0."); return; }
    if (type === "percentage" && numValue > 100) { setCreateError("Percentage cannot exceed 100."); return; }
    if (appliesTo === "specific_categories" && selectedCategories.length === 0) {
      setCreateError("Select at least one category."); return;
    }

    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          type,
          // For fixed type, value is entered in dollars → convert to cents
          value: type === "fixed" ? Math.round(numValue * 100) : numValue,
          max_uses: maxUses ? parseInt(maxUses) : null,
          valid_from: validFrom || null,
          valid_until: validUntil || null,
          applies_to: appliesTo,
          categories: appliesTo === "specific_categories" ? selectedCategories : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      resetForm();
      setShowForm(false);
      await fetchCoupons();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create coupon");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    const res = await fetch(`/api/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !coupon.is_active }),
    });
    if (res.ok) {
      setCoupons((prev) => prev.map((c) => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c));
    }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-[family-name:var(--font-cormorant)] italic text-[#044e77] text-3xl">
          Discount Coupons
        </h1>
        <button
          onClick={() => { setShowForm(true); resetForm(); }}
          className="bg-[#044e77] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#033d5c] transition-colors"
        >
          + Create Coupon
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-[#e8e0d8] rounded-xl p-6 mb-6">
          <h2 className="text-base font-medium text-[#1a1a1a] mb-4">New Coupon</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Code *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="SUMMER20"
                  required
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm uppercase tracking-wider focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Type *</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "percentage" | "fixed")}
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77] bg-white"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed amount ($)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">
                  {type === "percentage" ? "Discount %" : "Discount $"} *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step={type === "percentage" ? "1" : "0.01"}
                  max={type === "percentage" ? "100" : undefined}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={type === "percentage" ? "20" : "10.00"}
                  required
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Max Uses (leave blank for unlimited)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="100"
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Valid From</label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#7a6f68] mb-1">Valid Until</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full border border-[#ddd8d2] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#044e77]"
                />
              </div>
            </div>

            {/* Applies to */}
            <div>
              <label className="block text-xs text-[#7a6f68] mb-2">Applies To</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={appliesTo === "all"}
                    onChange={() => setAppliesTo("all")}
                    className="accent-[#044e77]"
                  />
                  <span className="text-sm text-[#3a3330]">All services</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={appliesTo === "specific_categories"}
                    onChange={() => setAppliesTo("specific_categories")}
                    className="accent-[#044e77]"
                  />
                  <span className="text-sm text-[#3a3330]">Specific categories</span>
                </label>
              </div>

              {appliesTo === "specific_categories" && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleCategory(cat.value)}
                      className={[
                        "px-3 py-1.5 rounded-full text-xs border transition-colors",
                        selectedCategories.includes(cat.value)
                          ? "bg-[#044e77] text-white border-[#044e77]"
                          : "border-[#ddd8d2] text-[#7a6f68] hover:border-[#044e77]",
                      ].join(" ")}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="bg-[#044e77] text-white text-sm px-5 py-2 rounded-lg hover:bg-[#033d5c] disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating…" : "Create Coupon"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="text-sm text-[#7a6f68] px-4 py-2 rounded-lg border border-[#ddd8d2] hover:bg-[#f5f1ed] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-[#9a8f87]">Loading…</div>
      ) : coupons.length === 0 ? (
        <div className="text-sm text-[#9a8f87]">No coupons yet.</div>
      ) : (
        <div className="bg-white border border-[#e8e0d8] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f5f2] border-b border-[#e8e0d8]">
              <tr>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Code</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Discount</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Uses</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden md:table-cell">Validity</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium hidden lg:table-cell">Scope</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9a8f87] font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ebe4]">
              {coupons.map((coupon) => {
                const today = new Date().toISOString().slice(0, 10);
                const expired = coupon.valid_until && today > coupon.valid_until;
                const notYet = coupon.valid_from && today < coupon.valid_from;
                const maxed = coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses;

                return (
                  <tr key={coupon.id} className={`hover:bg-[#faf8f6] ${!coupon.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs tracking-wider text-[#1a1a1a] font-semibold">
                      {coupon.code}
                    </td>
                    <td className="px-4 py-3 text-[#1a1a1a]">
                      {formatCouponValue(coupon)}
                    </td>
                    <td className="px-4 py-3 text-[#7a6f68]">
                      {coupon.uses_count}
                      {coupon.max_uses !== null && ` / ${coupon.max_uses}`}
                    </td>
                    <td className="px-4 py-3 text-[#9a8f87] text-xs hidden md:table-cell">
                      {coupon.valid_from || coupon.valid_until ? (
                        <>
                          {coupon.valid_from ? formatDate(coupon.valid_from) : "Any"}{" → "}
                          {coupon.valid_until ? formatDate(coupon.valid_until) : "No end"}
                        </>
                      ) : (
                        "Always valid"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#9a8f87] text-xs hidden lg:table-cell">
                      {coupon.applies_to === "all" ? (
                        "All services"
                      ) : (
                        coupon.coupon_category_restrictions
                          .map((r) => CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category)
                          .join(", ")
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={[
                        "px-2 py-0.5 rounded-full text-xs",
                        !coupon.is_active || expired || maxed
                          ? "bg-[#f0ebe4] text-[#9a8f87]"
                          : notYet
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800",
                      ].join(" ")}>
                        {!coupon.is_active ? "Inactive" : expired ? "Expired" : maxed ? "Maxed" : notYet ? "Upcoming" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(coupon)}
                        className="text-xs text-[#7a6f68] hover:text-[#044e77] transition-colors"
                      >
                        {coupon.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
