import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendAppointmentReminder, sendClassReminder } from "@/lib/notifications";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Runs every hour via Vercel Cron (see vercel.json).
// Sends 48-hour reminders for:
//   - appointments with status = 'confirmed' starting in the 48–49 hour window
//   - class bookings (status = 'confirmed') for active sessions in the same window
export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  const auth   = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Time window: appointments starting between now+48h and now+49h ────────
  const now         = new Date();
  const windowStart = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const windowEnd   = new Date(now.getTime() + 49 * 60 * 60 * 1000).toISOString();

  console.log(`[cron/reminders] running at ${now.toISOString()}, window ${windowStart} → ${windowEnd}`);

  let sent   = 0;
  let errors = 0;

  // ── Regular appointments ──────────────────────────────────────────────────
  const { data: appointments, error: apptsErr } = await supabase()
    .from("appointments")
    .select(`
      id, start_datetime,
      services ( name, duration_minutes ),
      clients  ( first_name, last_name, email, mobile )
    `)
    .eq("status", "confirmed")
    .gte("start_datetime", windowStart)
    .lt("start_datetime",  windowEnd);

  if (apptsErr) {
    console.error("[cron/reminders] appointments query failed:", apptsErr.message);
  } else {
    for (const appt of appointments ?? []) {
      const client  = appt.clients  as unknown as { first_name: string; last_name: string; email: string; mobile: string } | null;
      const service = appt.services as unknown as { name: string; duration_minutes: number } | null;

      if (!client || !service) {
        console.warn(`[cron/reminders] appointment ${appt.id} missing client or service — skipped`);
        continue;
      }

      try {
        await sendAppointmentReminder({
          client,
          serviceName:     service.name,
          durationMinutes: service.duration_minutes,
          startISO:        appt.start_datetime,
        });
        console.log(
          `[cron/reminders] appointment ${appt.id} — ${client.first_name} ${client.last_name}` +
          ` — email sent${client.mobile?.trim() ? " + SMS sent" : " (no mobile)"}`,
        );
        sent++;
      } catch (err) {
        console.error(`[cron/reminders] appointment ${appt.id} failed:`, err);
        errors++;
      }
    }
  }

  // ── Class session bookings ────────────────────────────────────────────────
  // Step 1: find active sessions in the reminder window
  const { data: sessions, error: sessionsErr } = await supabase()
    .from("class_sessions")
    .select("id, title, start_datetime, duration_minutes")
    .eq("active", true)
    .gte("start_datetime", windowStart)
    .lt("start_datetime",  windowEnd);

  if (sessionsErr) {
    console.error("[cron/reminders] class_sessions query failed:", sessionsErr.message);
  } else if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((s) => s.id);
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));

    // Step 2: get confirmed bookings for those sessions
    const { data: bookings, error: bookingsErr } = await supabase()
      .from("class_bookings")
      .select(`
        id, session_id,
        clients ( first_name, last_name, email, mobile )
      `)
      .in("session_id", sessionIds)
      .eq("status", "confirmed");

    if (bookingsErr) {
      console.error("[cron/reminders] class_bookings query failed:", bookingsErr.message);
    } else {
      for (const booking of bookings ?? []) {
        const client  = booking.clients as unknown as { first_name: string; last_name: string; email: string; mobile: string } | null;
        const session = sessionMap.get(booking.session_id);

        if (!client || !session) {
          console.warn(`[cron/reminders] class booking ${booking.id} missing client or session — skipped`);
          continue;
        }

        try {
          await sendClassReminder({
            client,
            className:       session.title,
            durationMinutes: session.duration_minutes,
            startISO:        session.start_datetime,
          });
          console.log(
            `[cron/reminders] class booking ${booking.id} — ${client.first_name} ${client.last_name}` +
            ` (${session.title}) — email sent${client.mobile?.trim() ? " + SMS sent" : " (no mobile)"}`,
          );
          sent++;
        } catch (err) {
          console.error(`[cron/reminders] class booking ${booking.id} failed:`, err);
          errors++;
        }
      }
    }
  }

  console.log(`[cron/reminders] done — ${sent} reminder(s) sent, ${errors} error(s)`);
  return NextResponse.json({ ok: true, sent, errors, window: { start: windowStart, end: windowEnd } });
}
