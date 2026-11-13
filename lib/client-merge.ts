// Pure helpers for the admin "Merge clients" flow. The merge itself is
// merge_clients() in supabase/migrations/client_dedupe_2026_11.sql.

const TABLE_LABELS: Record<string, string> = {
  "appointments.client_id": "appointments",
  "class_bookings.client_id": "class bookings",
  "intake_forms.client_id": "intake forms",
};

export interface MergeMove {
  key: string;   // "appointments.client_id" (schema prefix dropped)
  label: string; // "appointments"
  count: number;
}

/**
 * { "appointments.client_id": 2, "public.intake_forms.client_id": 1 }
 * → readable rows. Unknown tables (added after this was written) still show,
 * by table name, so nothing moves silently.
 */
export function describeMergeMoves(moved: Record<string, number>): MergeMove[] {
  return Object.entries(moved)
    .map(([raw, count]) => {
      const key = raw.replace(/^public\./, "");
      const label = TABLE_LABELS[key] ?? key.replace(/\.client_id$/, "").replace(/_/g, " ");
      return { key, label, count: Number(count) || 0 };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Old emails dropped by a merge that may still be Mailchimp contacts. */
export function oldEmailWarnings(oldEmails: string[]): string[] {
  return oldEmails.map((e) => `Old email ${e} may still be in Mailchimp, archive it there`);
}

export interface MergeCandidate {
  id: string;
  email: string;
  mobile: string | null;
  created_at: string;
  last_booked: string | null;
}

/**
 * Default email to keep: the most recently used one, i.e. the record that
 * last made a booking (future ones count), else the more recently created.
 */
export function defaultMergeEmail(a: MergeCandidate, b: MergeCandidate): string {
  const when = (c: MergeCandidate) => c.last_booked ?? c.created_at;
  return when(b) > when(a) ? b.email : a.email;
}
