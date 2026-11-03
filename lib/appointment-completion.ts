import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertMailchimpContact } from "@/lib/notifications";
import { isMakeupLesson } from "@/lib/makeup-lessons";

/** Clear is_new_client once the client has another confirmed/completed appointment. */
export async function clearNewClientFlagIfReturning(db: SupabaseClient, clientId: string, appointmentId: string) {
  const { data: priorConfirmed } = await db
    .from("appointments")
    .select("id")
    .eq("client_id", clientId)
    .in("status", ["confirmed", "completed"])
    .neq("id", appointmentId)
    .limit(1);

  if (priorConfirmed && priorConfirmed.length > 0) {
    await db.from("clients").update({ is_new_client: false }).eq("id", clientId);
  }
}

/**
 * Side effects of an appointment becoming completed — shared by the status
 * PATCH and the Complete/payment panel so neither skips them. Call once, on
 * the transition to completed (not when recording a later payment).
 */
export async function onAppointmentCompleted(db: SupabaseClient, appointmentId: string) {
  const { data: appt } = await db
    .from("appointments")
    .select(`
      client_id,
      services ( name, category ),
      clients ( first_name, last_name, email, is_new_client )
    `)
    .eq("id", appointmentId)
    .single();
  if (!appt) return;

  // Read before clearing, so Mailchimp gets the client's new/returning state for this visit.
  const clientData = appt.clients as unknown as { first_name: string; last_name: string; email: string; is_new_client: boolean } | null;
  const svcData = appt.services as unknown as { name: string; category: string } | null;

  if (appt.client_id) await clearNewClientFlagIfReturning(db, appt.client_id as string, appointmentId);

  // Admin-only services (e.g. Treatment Plan Facial) have no Mailchimp journey.
  if (svcData?.category === "admin-only") {
    console.info(`[completion] skipping Mailchimp for admin-only service "${svcData.name}" (appointment ${appointmentId})`);
    return;
  }

  // Mailchimp upsert + tag on completion
  if (clientData?.email && svcData?.category) {
    // The Private and Me & a Friend lessons are booked as appointments in
    // category "make-up" (shared with Professional Make-Up Application), so
    // they're matched by name onto their own tag mapping key plus the base
    // "makeup-class" tag — group classes get that base tag from the cron job
    // in app/api/cron/reminders, but appointments are never seen by that cron.
    // Mother & Daughter has its own category ("mother-daughter"), which maps
    // to the same post-makeup-class tags. Only the booking client (the mum,
    // or the client who brought a friend) is tagged — never the others.
    //
    // Scheduled with after() so Vercel keeps the function alive until the
    // Mailchimp requests finish (an un-awaited promise was frozen mid-flight
    // and silently dropped), without slowing the admin response. A failure
    // is logged but never affects the completion itself.
    const isLessonInMakeUp = svcData.category === "make-up" && isMakeupLesson(svcData.name);
    const email = clientData.email;
    const contact = {
      email,
      firstName: clientData.first_name,
      lastName: clientData.last_name,
      serviceCategory: isLessonInMakeUp ? "personal-make-up-class" : svcData.category,
      isNewClient: clientData.is_new_client,
      extraTags: isLessonInMakeUp ? ["makeup-class"] : undefined,
    };
    after(() =>
      upsertMailchimpContact(contact).catch((err) =>
        console.error(`[completion] Mailchimp upsert/tag failed for appointment ${appointmentId} (${email}):`, err),
      ),
    );
  }
}
