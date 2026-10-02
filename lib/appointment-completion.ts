import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertMailchimpContact } from "@/lib/notifications";

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

  // Mailchimp upsert + tag on completion
  if (clientData?.email && svcData?.category) {
    // Personal Make Up Class is booked as an appointment (category "make-up",
    // shared with Professional Make-Up Application), so it needs its own tag
    // mapping key plus the base "makeup-class" tag — group classes get that
    // base tag from the cron job in app/api/cron/reminders, but appointments
    // are never seen by that cron.
    const isPersonalClass = svcData.name === "Personal Make Up Class";
    upsertMailchimpContact({
      email: clientData.email,
      firstName: clientData.first_name,
      lastName: clientData.last_name,
      serviceCategory: isPersonalClass ? "personal-make-up-class" : svcData.category,
      isNewClient: clientData.is_new_client,
      extraTags: isPersonalClass ? ["makeup-class"] : undefined,
    }).catch(console.error);
  }
}
