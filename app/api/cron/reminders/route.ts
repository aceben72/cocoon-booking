import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
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
  const secret      = process.env.CRON_SECRET;
  const auth        = request.headers.get("authorization");
  const querySecret = new URL(request.url).searchParams.get("secret");
  if (!secret || (auth !== `Bearer ${secret}` && querySecret !== secret)) {
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

  // ── Follow-up emails (completed appointments, ~24h after end_datetime) ────
  const followupWindowStart = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
  const followupWindowEnd   = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();

  console.log(`[cron/reminders] follow-up window: ${followupWindowStart} → ${followupWindowEnd}`);

  let followupSent   = 0;
  let followupErrors = 0;

  const { data: completedAppts, error: completedErr } = await supabase()
    .from("appointments")
    .select(`
      id,
      services ( name ),
      clients  ( first_name, email )
    `)
    .eq("status", "completed")
    .is("followup_sent_at", null)
    .gte("end_datetime", followupWindowStart)
    .lte("end_datetime", followupWindowEnd);

  if (completedErr) {
    console.error("[cron/reminders] follow-up query failed:", completedErr.message);
  } else {
    const EXCLUDE_SERVICES = ["Make-Up Class", "Mother Daughter Make-Up Class"];
    const resendKey = process.env.RESEND_API_KEY;

    for (const appt of completedAppts ?? []) {
      const client  = appt.clients  as unknown as { first_name: string; email: string } | null;
      const service = appt.services as unknown as { name: string } | null;

      if (!service || EXCLUDE_SERVICES.includes(service.name)) {
        console.log(`[cron/reminders] follow-up ${appt.id} — skipped (make-up class)`);
        continue;
      }

      if (!client?.email) {
        console.log(`[cron/reminders] follow-up ${appt.id} — no client email, marking sent to prevent retry`);
        await supabase()
          .from("appointments")
          .update({ followup_sent_at: now.toISOString() })
          .eq("id", appt.id);
        continue;
      }

      if (!resendKey) {
        console.warn("[cron/reminders] RESEND_API_KEY not set — skipping follow-up emails");
        break;
      }

      try {
        console.log(`[cron/reminders] follow-up ${appt.id} — sending to ${client.email}`);
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Cocoon Skin & Beauty <amanda@cocoonskinandbeauty.com.au>",
            reply_to: ["amanda@cocoonskinandbeauty.com.au"],
            to: [client.email],
            subject: `How did you go, ${client.first_name}? ✨`,
            html: buildFollowUpEmail({ firstName: client.first_name, serviceName: service.name }),
          }),
        });

        const result = await response.json() as { id?: string; name?: string; message?: string };
        if (response.ok) {
          await supabase()
            .from("appointments")
            .update({ followup_sent_at: now.toISOString() })
            .eq("id", appt.id);
          console.log(`[cron/reminders] follow-up ${appt.id} — sent (Resend id: ${result.id})`);
          followupSent++;
        } else {
          console.error(`[cron/reminders] follow-up ${appt.id} — Resend error:`, JSON.stringify(result));
          followupErrors++;
        }
      } catch (err) {
        console.error(`[cron/reminders] follow-up ${appt.id} failed:`, err);
        followupErrors++;
      }
    }
  }

  console.log(`[cron/reminders] follow-ups done — ${followupSent} sent, ${followupErrors} error(s)`);

  // ── Mailchimp tagging for completed Make-Up Class participants ────────────
  // For every confirmed class_booking whose session has ended and which has not
  // yet been tagged, upsert the member to the Mailchimp audience and apply the
  // "makeup-class" tag, then stamp mailchimp_tagged_at to prevent re-processing.
  const mcApiKey    = process.env.MAILCHIMP_API_KEY;
  const mcPrefix    = process.env.MAILCHIMP_SERVER_PREFIX;
  const mcAudience  = "89c5fafdee";

  let mcTagged = 0;
  let mcErrors = 0;

  if (!mcApiKey || !mcPrefix) {
    console.warn("[cron/mailchimp] MAILCHIMP_API_KEY or MAILCHIMP_SERVER_PREFIX not set — skipping");
  } else {
    try {
      // Step 1: find active sessions that started in the past
      // (filter to those whose end time has also passed, in JS)
      const { data: pastSessions, error: pastSessionsErr } = await supabase()
        .from("class_sessions")
        .select("id, start_datetime, duration_minutes")
        .eq("active", true)
        .lt("start_datetime", now.toISOString());

      if (pastSessionsErr) {
        console.error("[cron/mailchimp] class_sessions query failed:", pastSessionsErr.message);
      } else {
        const endedSessionIds = (pastSessions ?? [])
          .filter((s) => {
            const endMs = new Date(s.start_datetime).getTime() + s.duration_minutes * 60_000;
            return endMs < now.getTime();
          })
          .map((s) => s.id);

        if (endedSessionIds.length > 0) {
          // Step 2: confirmed, not-yet-tagged bookings for those sessions
          const { data: untagged, error: untaggedErr } = await supabase()
            .from("class_bookings")
            .select("id, clients ( first_name, last_name, email )")
            .in("session_id", endedSessionIds)
            .eq("status", "confirmed")
            .is("mailchimp_tagged_at", null);

          if (untaggedErr) {
            console.error("[cron/mailchimp] class_bookings query failed:", untaggedErr.message);
          } else {
            const auth = Buffer.from(`anystring:${mcApiKey}`).toString("base64");

            for (const booking of untagged ?? []) {
              const client = booking.clients as unknown as {
                first_name: string;
                last_name:  string;
                email:      string;
              } | null;

              if (!client?.email) {
                console.warn(`[cron/mailchimp] booking ${booking.id} — no client email, skipping`);
                continue;
              }

              try {
                const emailHash = createHash("md5").update(client.email.toLowerCase()).digest("hex");
                const memberUrl = `https://${mcPrefix}.api.mailchimp.com/3.0/lists/${mcAudience}/members/${emailHash}`;

                // Upsert member (subscribe if new, keep status if already subscribed)
                const memberRes = await fetch(memberUrl, {
                  method: "PUT",
                  headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email_address: client.email,
                    status_if_new: "subscribed",
                    merge_fields: { FNAME: client.first_name, LNAME: client.last_name },
                  }),
                });

                if (!memberRes.ok) {
                  const err = await memberRes.json();
                  throw new Error(`Mailchimp upsert failed: ${JSON.stringify(err)}`);
                }

                // Apply makeup-class tag
                const tagRes = await fetch(`${memberUrl}/tags`, {
                  method: "POST",
                  headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    tags: [{ name: "makeup-class", status: "active" }],
                  }),
                });

                if (!tagRes.ok) {
                  const err = await tagRes.json();
                  // Log but don't throw — member was successfully upserted
                  console.error(`[cron/mailchimp] tag failed for ${client.email}:`, JSON.stringify(err));
                } else {
                  console.log(`[cron/mailchimp] tagged ${client.email} as makeup-class`);
                }

                // Stamp the booking so it isn't processed again (even if tag call failed)
                await supabase()
                  .from("class_bookings")
                  .update({ mailchimp_tagged_at: now.toISOString() })
                  .eq("id", booking.id);

                mcTagged++;
              } catch (err) {
                console.error(`[cron/mailchimp] booking ${booking.id} failed:`, err);
                mcErrors++;
                // Do NOT stamp mailchimp_tagged_at — will be retried next run
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[cron/mailchimp] unexpected error:", err);
    }
  }

  console.log(`[cron/mailchimp] done — ${mcTagged} tagged, ${mcErrors} error(s)`);

  return NextResponse.json({
    ok: true,
    reminders:  { sent, errors },
    followups:  { sent: followupSent, errors: followupErrors },
    mailchimp:  { tagged: mcTagged, errors: mcErrors },
    windows: {
      reminders: { start: windowStart, end: windowEnd },
      followups: { start: followupWindowStart, end: followupWindowEnd },
    },
  });
}

function buildFollowUpEmail({ firstName, serviceName }: { firstName: string; serviceName: string }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f5f2;font-family:'Jost',Arial,sans-serif;font-weight:300;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5f2;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr>
          <td align="center" style="background:#044e77;padding:32px 24px;border-radius:12px 12px 0 0;">
            <img src="https://mcusercontent.com/644ef8c7fbae49e3b1826dda3/images/1b7a3cb7-18c0-682d-62bf-921900b53c86.png"
                 alt="Cocoon Skin & Beauty" height="48" style="display:block;">
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:40px 32px;border-radius:0 0 12px 12px;">
            <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
                       font-style:italic;color:#044e77;margin:0 0 8px;">
              How did you go, ${firstName}? ✨
            </h1>
            <p style="color:#7a6f68;font-size:15px;margin:0 0 24px;line-height:1.6;">
              Thank you so much for visiting Cocoon — it was lovely having you in.
              I hope you're loving the results from your ${serviceName}.
            </p>
            <p style="color:#7a6f68;font-size:15px;margin:0 0 24px;line-height:1.6;">
              If you have any questions or concerns about your treatment, please don't hesitate to get in touch.
              Simply reply to this email and I'll get back to you.
            </p>
            <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
              If you enjoyed your experience, I'd be so grateful if you could take a moment to leave a review —
              it makes a huge difference to a small business like mine.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:40px;">
              <tr><td align="center">
                <a href="https://g.page/r/CRCF4L0zs2HmEBM/review"
                   style="display:inline-block;background:#fbb040;color:#044e77;font-size:15px;
                          font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;">
                  Leave a Review
                </a>
              </td></tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="vertical-align:middle;padding-right:16px;">
                  <img src="https://mcusercontent.com/644ef8c7fbae49e3b1826dda3/images/8dd53e7d-dbec-13f1-0e2f-d85de8e4d16a.jpeg" alt="Amanda" width="64" height="64" style="display:block;border-radius:50%;object-fit:cover;border:2px solid #f0ebe4;">
                </td>
                <td style="vertical-align:middle;">
                  <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 2px;">Warm regards,</p>
                  <p style="color:#1a1a1a;font-size:14px;font-weight:500;line-height:1.7;margin:0 0 2px;">Amanda</p>
                  <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0;">Cocoon Skin &amp; Beauty</p>
                </td>
              </tr>
            </table>
            <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
                      border-top:1px solid #f0ebe4;padding-top:20px;">
              Cocoon Skin &amp; Beauty · 16 Bunderoo Circuit, Pimpama QLD 4209
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 0;">
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;
                      color:#b0a499;font-size:16px;margin:0;">
              Relax. Revive. Restore.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}
