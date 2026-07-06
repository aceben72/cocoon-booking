import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ClassBookingWizard from "./ClassBookingWizard";
import type { ClassSessionWithAvailability, ClassType } from "@/types";
import { CLASS_TYPE_LABELS } from "@/lib/class-types";

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
    .single();

  return data as ClassSessionWithAvailability | null;
}

export default async function ClassSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session) notFound();

  const title = CLASS_TYPE_LABELS[session.class_type as ClassType] ?? session.title;

  return <ClassBookingWizard session={{ ...session, title }} />;
}
