"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** ISO timestamp → "14 Nov 2026" (Brisbane). */
function formatReviewDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * "Left a Google review" mark for a client (clients.left_review_at).
 * PATCHes /api/admin/clients/[id] with { left_review }, which also adds or
 * removes the Mailchimp tag "left-review" so the review-request email is skipped.
 *
 * Used on the desktop client page, the desktop appointment row and the
 * phone calendar's appointment sheet. Pass onChange to update local state;
 * without it the page is refreshed.
 */
export function LeftReviewToggle({
  clientId,
  leftReviewAt,
  onChange,
  className = "",
}: {
  clientId: string;
  leftReviewAt: string | null | undefined;
  onChange?: (leftReviewAt: string | null) => void;
  className?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reviewed = !!leftReviewAt;

  async function setReviewed(value: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left_review: value }),
      });
      const d = await res.json().catch(() => ({})) as {
        error?: string;
        client?: { left_review_at?: string | null };
      };
      if (!res.ok) {
        setError(d.error ?? "Failed to update");
        return;
      }
      if (onChange) onChange(d.client?.left_review_at ?? null);
      else router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {reviewed ? (
        <>
          <span className="text-sm text-emerald-700 font-medium">
            ✓ Left a review · {formatReviewDate(leftReviewAt!)}
          </span>
          <button
            type="button"
            onClick={() => setReviewed(false)}
            disabled={saving}
            className="min-h-[44px] px-3 text-xs text-[#7a6f68] underline underline-offset-2
                       hover:text-[#044e77] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Undo"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setReviewed(true)}
          disabled={saving}
          className="min-h-[44px] px-4 rounded-xl border border-[#ddd8d2] bg-white text-sm text-[#044e77]
                     hover:border-[#044e77] active:opacity-80 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Left a Google review"}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
