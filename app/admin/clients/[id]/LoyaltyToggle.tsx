"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** On/off switch for clients.exclude_from_loyalty. */
export function LoyaltyToggle({ clientId, excluded }: { clientId: string; excluded: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const included = !excluded;

  async function toggle() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exclude_from_loyalty: included }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setError(d.error ?? "Failed to update");
        return;
      }
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={included}
        aria-label="Include in facial loyalty reward"
        onClick={toggle}
        disabled={saving}
        className={[
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          included ? "bg-[#044e77]" : "bg-[#d8d0c8]",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
            included ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
      <span className="text-sm text-[#5a504a]">
        {saving ? "Saving…" : included ? "Included in loyalty reward" : "Excluded from loyalty reward"}
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
