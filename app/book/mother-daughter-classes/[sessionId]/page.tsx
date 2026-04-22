import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ClassBookingWizard from "@/app/book/make-up-classes/[sessionId]/ClassBookingWizard";
import type { ClassSessionWithAvailability } from "@/types";

export const dynamic = "force-dynamic";

async function getSession(id: string): Promise<ClassSessionWithAvailability | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("class_sessions_with_availability")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .eq("class_type", "mother_daughter")
    .single();

  return data as ClassSessionWithAvailability | null;
}

export default async function MotherDaughterSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session) notFound();

  return (
    <ClassBookingWizard
      session={{ ...session, title: "Mother & Daughter Make-Up Class" }}
      backPath="/book/mother-daughter-classes"
      categoryLabel="Mother & Daughter Classes"
    />
  );
}
