"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { defaultMergeEmail, type MergeMove } from "@/lib/client-merge";

interface Side {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string | null;
  created_at: string;
  appointments: number;
  classes: number;
  last_visit: string | null;
  last_booked: string | null;
}

interface Pair {
  reason: string;
  a: Side;
  b: Side;
}

interface MergeResult {
  name: string;
  keptId: string;
  moves: MergeMove[];
  warnings: string[];
}

type RawPair = Record<string, unknown> & { client_a: string; client_b: string; reason: string };

function side(p: RawPair, k: "a" | "b"): Side {
  const g = (f: string) => p[`${k}_${f}`];
  return {
    id: k === "a" ? p.client_a : p.client_b,
    first_name: String(g("first_name") ?? ""),
    last_name: String(g("last_name") ?? ""),
    email: String(g("email") ?? ""),
    mobile: (g("mobile") as string | null) ?? null,
    created_at: String(g("created_at") ?? ""),
    appointments: Number(g("appointments") ?? 0),
    classes: Number(g("classes") ?? 0),
    last_visit: (g("last_visit") as string | null) ?? null,
    last_booked: (g("last_booked") as string | null) ?? null,
  };
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

const fullName = (s: Side) => `${s.first_name} ${s.last_name}`.trim();
const pairKey = (p: Pair) => `${p.a.id}|${p.b.id}`;

export function DuplicatesList() {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<Pair | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/client-duplicates", { cache: "no-store" });
    const d = await res.json().catch(() => ({})) as { pairs?: RawPair[]; error?: string };
    if (!res.ok) {
      setError(d.error ?? "Couldn't load possible duplicates");
      setPairs([]);
      return;
    }
    setPairs((d.pairs ?? []).map((p) => ({ reason: p.reason, a: side(p, "a"), b: side(p, "b") })));
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function dismiss(p: Pair) {
    setBusy(pairKey(p));
    setError(null);
    const res = await fetch("/api/admin/client-duplicates/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientA: p.a.id, clientB: p.b.id }),
    });
    const d = await res.json().catch(() => ({})) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      setError(d.error ?? "Couldn't save that");
      return;
    }
    window.dispatchEvent(new Event("client-duplicates-changed"));
    await load();
  }

  if (pairs === null) return <p className="text-sm text-[#7a6f68]">Loading…</p>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900 space-y-1">
          <p className="font-medium">
            Merged into{" "}
            <Link href={`/admin/clients/${result.keptId}`} className="underline">{result.name}</Link>.
          </p>
          <p>
            Moved:{" "}
            {result.moves.filter((m) => m.count > 0).map((m) => `${m.count} ${m.label}`).join(", ") ||
              "nothing (that record had no bookings)"}
            .
          </p>
          {result.warnings.map((w) => (
            <p key={w} className="text-amber-800">⚠ {w}</p>
          ))}
        </div>
      )}

      {pairs.length === 0 && !error && (
        <p className="text-sm text-[#7a6f68] bg-white border border-[#ece6df] rounded-xl p-6">
          No possible duplicates.
        </p>
      )}

      {pairs.map((p) => (
        <div key={pairKey(p)} className="bg-white border border-[#ece6df] rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-[#9a8f88] mb-3">{p.reason}</p>
          <div className="grid grid-cols-2 gap-4">
            {[p.a, p.b].map((s) => (
              <div key={s.id} className="text-sm space-y-0.5 min-w-0">
                <Link href={`/admin/clients/${s.id}`} className="font-medium text-[#044e77] hover:underline">
                  {fullName(s)}
                </Link>
                <p className="text-[#5a504a] break-all">{s.email}</p>
                <p className="text-[#5a504a]">{s.mobile ?? "No mobile"}</p>
                <p className="text-[#7a6f68]">
                  {s.appointments} appointment{s.appointments === 1 ? "" : "s"} · {s.classes} class
                  {s.classes === 1 ? "" : "es"}
                </p>
                <p className="text-[#7a6f68]">Last visit: {formatDate(s.last_visit)}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => { setResult(null); setMerging(p); }}
              className="h-9 px-4 rounded-lg bg-[#044e77] text-white text-xs font-medium hover:bg-[#033d5e]"
            >
              Merge
            </button>
            <button
              onClick={() => dismiss(p)}
              disabled={busy === pairKey(p)}
              className="h-9 px-3 rounded-lg border border-[#ddd8d2] text-xs text-[#5a504a] hover:bg-[#f8f5f2] disabled:opacity-50"
            >
              {busy === pairKey(p) ? "Saving…" : "Not a duplicate"}
            </button>
          </div>
        </div>
      ))}

      {merging && (
        <MergeDialog
          pair={merging}
          onClose={() => setMerging(null)}
          onMerged={async (r) => {
            setMerging(null);
            setResult(r);
            window.dispatchEvent(new Event("client-duplicates-changed"));
            await load();
          }}
        />
      )}
    </div>
  );
}

function MergeDialog({
  pair,
  onClose,
  onMerged,
}: {
  pair: Pair;
  onClose: () => void;
  onMerged: (r: MergeResult) => void;
}) {
  // Default: keep the record (and email) used most recently.
  const defaultEmail = defaultMergeEmail(pair.a, pair.b);
  const [keepId, setKeepId] = useState(defaultEmail === pair.b.email ? pair.b.id : pair.a.id);
  const [email, setEmail] = useState(defaultEmail);
  const keep = keepId === pair.a.id ? pair.a : pair.b;
  const gone = keepId === pair.a.id ? pair.b : pair.a;
  const [mobile, setMobile] = useState<string | null>(keep.mobile ?? gone.mobile);
  const [moves, setMoves] = useState<MergeMove[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // What would move off the record being merged away (read-only preview).
  useEffect(() => {
    let live = true;
    setMoves(null);
    setError(null);
    fetch(`/api/admin/client-merge?remove=${gone.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { moves?: MergeMove[]; error?: string }) => {
        if (!live) return;
        if (d.moves) setMoves(d.moves);
        else setError(d.error ?? "Couldn't work out what would move");
      })
      .catch(() => { if (live) setError("Couldn't work out what would move"); });
    return () => { live = false; };
  }, [gone.id]);

  const emails = [...new Set([pair.a.email, pair.b.email])];
  const mobiles = [...new Set([pair.a.mobile, pair.b.mobile].filter((m): m is string => !!m))];

  function chooseKeep(s: Side) {
    setKeepId(s.id);
    const other = s.id === pair.a.id ? pair.b : pair.a;
    setMobile(s.mobile ?? other.mobile);
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/client-merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId: keep.id, removeId: gone.id, email, mobile }),
    });
    const d = await res.json().catch(() => ({})) as { error?: string; moves?: MergeMove[]; warnings?: string[] };
    setSaving(false);
    if (!res.ok) {
      setError(d.error ?? "The merge failed and nothing was changed.");
      return;
    }
    onMerged({ name: fullName(keep), keptId: keep.id, moves: d.moves ?? [], warnings: d.warnings ?? [] });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="merge-title">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 text-sm max-h-[90vh] overflow-y-auto">
        <h2 id="merge-title" className="text-lg font-medium text-[#044e77]">Merge clients</h2>

        <fieldset className="space-y-1">
          <legend className="font-medium text-[#1a1a1a] mb-1">Record to keep</legend>
          {[pair.a, pair.b].map((s) => (
            <label key={s.id} className="flex items-start gap-2">
              <input type="radio" name="keep" checked={keepId === s.id} onChange={() => chooseKeep(s)} className="mt-1" />
              <span>
                {fullName(s)}{" "}
                <span className="text-[#7a6f68] break-all">· {s.email} · client since {formatDate(s.created_at)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {emails.length > 1 && (
          <fieldset className="space-y-1">
            <legend className="font-medium text-[#1a1a1a] mb-1">Email to keep</legend>
            {emails.map((e) => (
              <label key={e} className="flex items-center gap-2">
                <input type="radio" name="email" checked={email === e} onChange={() => setEmail(e)} />
                <span className="break-all">
                  {e}
                  {e === defaultEmail && <span className="text-[#7a6f68]"> (most recently used)</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {mobiles.length > 1 && (
          <fieldset className="space-y-1">
            <legend className="font-medium text-[#1a1a1a] mb-1">Mobile to keep</legend>
            {mobiles.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="radio" name="mobile" checked={mobile === m} onChange={() => setMobile(m)} />
                <span>{m}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="bg-[#f8f5f2] rounded-lg p-3 space-y-1">
          <p className="font-medium text-[#1a1a1a]">
            Moves from {fullName(gone)} ({gone.email}) to {fullName(keep)}:
          </p>
          {moves === null && !error && <p className="text-[#7a6f68]">Checking…</p>}
          {moves && (
            <ul className="list-disc pl-5 text-[#5a504a]">
              {moves.map((m) => <li key={m.key}>{m.count} {m.label}</li>)}
            </ul>
          )}
          <p className="text-[#7a6f68]">
            Notes are combined and the earliest client-since date is kept. The {gone.email} record
            is then deleted. No emails or texts are sent. This can&rsquo;t be undone from here.
          </p>
        </div>

        {error && <p className="text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-9 px-3 rounded-lg border border-[#ddd8d2] text-xs text-[#5a504a] hover:bg-[#f8f5f2]"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={saving || moves === null}
            className="h-9 px-4 rounded-lg bg-[#044e77] text-white text-xs font-medium hover:bg-[#033d5e] disabled:opacity-50"
          >
            {saving ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
