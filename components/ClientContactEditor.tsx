"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isPlaceholderEmail, isValidEmail, normaliseSmsMobile } from "@/lib/utils";

export interface ClientContact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string | null;
}

/** "+61412345678" → "0412 345 678" (anything else shown as stored). */
function displayMobile(mobile: string) {
  const m = mobile.match(/^\+61(4\d{2})(\d{3})(\d{3})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : mobile;
}

const inputClass =
  "w-full border border-[#ddd8d2] rounded-xl px-3 py-2.5 text-base sm:text-sm text-[#1a1a1a] bg-white " +
  "focus:outline-none focus:border-[#044e77]";

/**
 * Client name, mobile and email with an "Edit details" form.
 * Used on the desktop client page and in the phone calendar's appointment sheet.
 */
export function ClientContactEditor({
  client,
  onSaved,
}: {
  client: ClientContact;
  onSaved?: (client: ClientContact) => void;
}) {
  const router = useRouter();
  const [editing, setEditing]     = useState(false);
  const [firstName, setFirstName] = useState(client.first_name);
  const [lastName, setLastName]   = useState(client.last_name);
  const [email, setEmail]         = useState(client.email);
  const [mobile, setMobile]       = useState(client.mobile ? displayMobile(client.mobile) : "");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  const placeholder = isPlaceholderEmail(client.email);
  const hasMobile   = !!client.mobile?.trim();

  function startEdit() {
    setFirstName(client.first_name);
    setLastName(client.last_name);
    setEmail(placeholder ? "" : client.email);
    setMobile(client.mobile ? displayMobile(client.mobile) : "");
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  async function save() {
    setError(null);
    // Placeholder emails start blank; leaving it blank keeps the placeholder.
    const emailToSave = email.trim() || (placeholder ? client.email : "");
    if (!firstName.trim() || !lastName.trim()) return setError("First and last name are required");
    if (!isValidEmail(emailToSave)) return setError("Enter a valid email address");
    if (mobile.trim() && !normaliseSmsMobile(mobile)) {
      return setError("Enter a valid Australian mobile (e.g. 0412 345 678)");
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email: emailToSave, mobile }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string; client?: ClientContact };
      if (!res.ok || !d.client) {
        setError(d.error ?? "Failed to save");
        return;
      }
      setEditing(false);
      setSaved(true);
      onSaved?.(d.client);
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="space-y-1.5 text-sm text-[#5a504a]">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[#9a8f87] w-14 shrink-0">Mobile</span>
          {hasMobile ? (
            <a href={`tel:${client.mobile}`} className="hover:text-[#044e77] transition-colors">
              {displayMobile(client.mobile!)}
            </a>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="text-amber-700 font-medium underline underline-offset-2"
            >
              Add mobile (no reminder texts)
            </button>
          )}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[#9a8f87] w-14 shrink-0">Email</span>
          <a href={`mailto:${client.email}`} className="hover:text-[#044e77] transition-colors break-all">
            {client.email}
          </a>
          {placeholder && (
            <button
              type="button"
              onClick={startEdit}
              className="text-xs text-amber-700 font-medium underline underline-offset-2"
            >
              Placeholder, add real email
            </button>
          )}
        </p>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={startEdit}
            className="px-3 py-1.5 rounded-full border border-[#044e77] text-[#044e77] text-xs font-medium
                       hover:bg-[#044e77] hover:text-white active:opacity-80 transition-colors"
          >
            Edit details
          </button>
          {saved && <span className="text-xs text-emerald-700">Saved</span>}
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => { e.preventDefault(); save(); }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-[#7a6f68] block mb-1">First name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#7a6f68] block mb-1">Last name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="off"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-[#7a6f68] block mb-1">Mobile</label>
        <input
          type="tel"
          inputMode="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="0412 345 678"
          autoComplete="off"
          className={inputClass}
        />
        {!mobile.trim() && (
          <p className="text-xs text-amber-700 mt-1">No mobile means no reminder texts.</p>
        )}
      </div>
      <div>
        <label className="text-xs font-medium text-[#7a6f68] block mb-1">Email</label>
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder ? "Real email address" : undefined}
          autoComplete="off"
          autoCapitalize="none"
          className={inputClass}
        />
        {placeholder && (
          <p className="text-xs text-[#9a8f87] mt-1 break-all">Currently a placeholder: {client.email}</p>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-[#044e77] text-white text-sm font-medium
                     active:opacity-80 disabled:opacity-50 transition-opacity"
        >
          {saving ? "Saving…" : "Save details"}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setError(null); }}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl border border-[#ddd8d2] text-[#5a504a] text-sm font-medium
                     active:opacity-80 disabled:opacity-50 transition-opacity"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
