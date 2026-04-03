import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import SessionDetail from "./SessionDetail";

export const dynamic = "force-dynamic";

async function getSessionDetail(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [sessionRes, bookingsRes] = await Promise.all([
    supabase
      .from("class_sessions_with_availability")
      .select("*")
      .eq("id", id)
      .single(),
    supabase
      .from("class_bookings")
      .select("id, status, amount_cents, square_payment_id, created_at, clients(first_name, last_name, email, mobile)")
      .eq("session_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (sessionRes.error || !sessionRes.data) return null;

  return {
    session:  sessionRes.data,
    bookings: bookingsRes.data ?? [],
  };
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getSessionDetail(id);
  if (!detail) notFound();

  return (
    <div>
      <Link
        href="/admin/classes"
        className="inline-flex items-center gap-1 text-sm text-[#7a6f68] hover:text-[#044e77] mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All classes
      </Link>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <SessionDetail session={detail.session as any} bookings={detail.bookings as any} />
    </div>
  );
}
