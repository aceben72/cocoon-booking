import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import BookingProgress from "@/components/BookingProgress";
import type { ClassSessionWithAvailability } from "@/types";

export const dynamic = "force-dynamic";

const CLASS_TYPE_LABELS: Record<string, string> = {
  masterclass:      "Make-Up Masterclass",
  mother_daughter:  "Mother Daughter Make-Up Class",
};

async function getSessions(): Promise<ClassSessionWithAvailability[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key);
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("class_sessions_with_availability")
    .select("*")
    .eq("active", true)
    .gte("start_datetime", now)
    .order("start_datetime", { ascending: true });

  return (data ?? []) as ClassSessionWithAvailability[];
}

function formatSessionDateTime(iso: string) {
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return `${date}, ${time}`;
}

export default async function MakeUpClassesPage() {
  const sessions = await getSessions();

  return (
    <>
      <BookingProgress currentStep={1} />

      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link
          href="/book"
          className="inline-flex items-center gap-1 text-sm text-[#7a6f68] hover:text-[#044e77] mb-8 transition-colors font-light"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All categories
        </Link>

        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-cormorant)] text-4xl font-light italic text-[#044e77] mb-2">
            Make-Up Classes
          </h1>
          <p className="text-[#7a6f68] font-light text-sm">
            Learn professional techniques in a fun, relaxed group setting. Choose an upcoming session below.
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e8e0d8] p-10 text-center">
            <p className="font-[family-name:var(--font-cormorant)] text-2xl italic text-[#044e77] mb-3">
              No classes scheduled yet
            </p>
            <p className="text-sm text-[#7a6f68] font-light">
              Check back soon, or contact Amanda directly to register your interest.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sessions.map((session) => {
              const full     = session.spots_remaining <= 0;
              const typeLabel = CLASS_TYPE_LABELS[session.class_type] ?? session.title;

              return (
                <Link
                  key={session.id}
                  href={full ? "#" : `/book/make-up-classes/${session.id}`}
                  aria-disabled={full}
                  className={[
                    "group bg-white rounded-2xl border p-6 flex flex-col gap-3 transition-all duration-200",
                    full
                      ? "border-[#e8e0d8] opacity-60 cursor-not-allowed pointer-events-none"
                      : "border-[#e8e0d8] hover:border-[#fbb040] hover:shadow-md",
                  ].join(" ")}
                >
                  {/* Class type badge */}
                  <span className="inline-block text-xs uppercase tracking-widest text-[#fbb040] font-medium">
                    {typeLabel}
                  </span>

                  {/* Date / time */}
                  <h2 className="font-[family-name:var(--font-cormorant)] text-xl font-medium text-[#044e77]
                                 group-hover:text-[#033d5c] transition-colors">
                    {formatSessionDateTime(session.start_datetime)}
                  </h2>

                  {session.description && (
                    <p className="text-sm text-[#7a6f68] font-light leading-relaxed">
                      {session.description}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[#9a8f87] font-light">
                    <span>3 hours</span>
                    <span>$89 per person</span>
                    <span
                      className={[
                        "font-medium",
                        full
                          ? "text-red-500"
                          : session.spots_remaining <= 1
                          ? "text-amber-600"
                          : "text-emerald-600",
                      ].join(" ")}
                    >
                      {full
                        ? "Fully Booked"
                        : `${session.spots_remaining} of ${session.capacity} spots available`}
                    </span>
                  </div>

                  {!full && (
                    <span className="mt-1 inline-flex items-center gap-1 text-sm text-[#044e77] font-medium
                                     group-hover:gap-2 transition-all">
                      Book this session
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <p className="text-center mt-12 font-[family-name:var(--font-cormorant)] text-lg italic text-[#b0a499]">
          Relax. Revive. Restore.
        </p>
      </div>
    </>
  );
}
