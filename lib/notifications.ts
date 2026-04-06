// Shared notification helpers for both appointments and class bookings.
// All sends are fire-and-forget — callers should .catch(console.error).

export interface NotifyClient {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
}

export interface ClassNotifyParams {
  className: string;     // e.g. "Make-Up Masterclass"
  startISO: string;
  durationMinutes: number;
  amountCents: number;
  quantity?: number;
  client: NotifyClient;
}

// ── Shared low-level senders ──────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  await resend.emails.send({
    from: "Cocoon Skin & Beauty <hello@cocoonskinandbeauty.com.au>",
    to,
    subject,
    html,
  });
}

async function sendSMS(to: string, body: string) {
  const user = process.env.CLICKSEND_USERNAME;
  const key  = process.env.CLICKSEND_API_KEY;
  if (!user || !key) return;
  const auth = Buffer.from(`${user}:${key}`).toString("base64");
  await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ body, to, source: "Cocoon" }] }),
  });
}

function aestDate(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function aestTime(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// ── Appointment confirmation (shared: used by public booking + payment link) ─

export interface AppointmentNotifyParams {
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
  amountPaidCents: number;
  startISO: string;
  client: NotifyClient;
}

export async function sendAppointmentConfirmation(params: AppointmentNotifyParams) {
  const { serviceName, durationMinutes, priceCents, amountPaidCents, startISO, client } = params;
  const displayDate = aestDate(startISO);
  const displayTime = aestTime(startISO);
  const mins = durationMinutes % 60;
  const hrs  = Math.floor(durationMinutes / 60);
  const duration = mins ? `${hrs} hr ${mins} min` : `${hrs} hours`;
  const amountPaid = `$${(amountPaidCents / 100).toFixed(0)}`;
  const outstanding = priceCents - amountPaidCents;

  console.log("[notifications] sending appointment confirmation email to:", client.email);
  try {
    await sendEmail(
      client.email,
      "Your Cocoon appointment is confirmed ✨",
      buildAppointmentConfirmationEmail({ client, serviceName, displayDate, displayTime, duration, amountPaid, outstanding }),
    );
    console.log("[notifications] appointment confirmation email sent to:", client.email);
  } catch (err) {
    console.error("[notifications] appointment confirmation email failed for:", client.email, err);
  }

  console.log("[notifications] sending appointment confirmation SMS to:", client.mobile);
  try {
    await sendSMS(
      client.mobile,
      `Hi ${client.first_name}, your ${serviceName} at Cocoon is confirmed for ${displayDate} at ${displayTime}. See you then! – Amanda`,
    );
    console.log("[notifications] appointment confirmation SMS sent to:", client.mobile);
  } catch (err) {
    console.error("[notifications] appointment confirmation SMS failed for:", client.mobile, err);
  }
}

// ── Payment request (admin-created bookings awaiting client payment) ─────────

export interface PaymentRequestParams {
  serviceName: string;
  startISO: string;
  paymentUrl: string;
  client: NotifyClient;
}

export async function sendPaymentRequest(params: PaymentRequestParams) {
  const { serviceName, startISO, paymentUrl, client } = params;
  const displayDate = aestDate(startISO);
  const displayTime = aestTime(startISO);

  try {
    await sendEmail(
      client.email,
      "Complete your Cocoon booking — payment required",
      buildPaymentRequestEmail({ client, serviceName, displayDate, displayTime, paymentUrl }),
    );
  } catch (err) {
    console.error("[notifications] payment request email failed:", err);
  }

  try {
    await sendSMS(
      client.mobile,
      `Hi ${client.first_name}, Amanda has reserved a ${serviceName} for you at Cocoon on ${displayDate} at ${displayTime}. Complete your booking here: ${paymentUrl} – Amanda`,
    );
  } catch (err) {
    console.error("[notifications] payment request SMS failed:", err);
  }
}

// ── Appointment reschedule notification ──────────────────────────────────

export interface RescheduleNotifyParams {
  serviceName: string;
  newStartISO: string;
  client: NotifyClient;
}

export async function sendRescheduleNotification(params: RescheduleNotifyParams) {
  const { serviceName, newStartISO, client } = params;
  const displayDate = aestDate(newStartISO);
  const displayTime = aestTime(newStartISO);
  const displayDay  = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
  }).format(new Date(newStartISO));

  try {
    await sendEmail(
      client.email,
      "Your Cocoon appointment has been rescheduled",
      buildRescheduleEmail({ client, serviceName, displayDate, displayTime }),
    );
  } catch (err) {
    console.error("[notifications] reschedule email failed:", err);
  }

  try {
    await sendSMS(
      client.mobile,
      `Hi ${client.first_name}, your ${serviceName} at Cocoon has been moved to ${displayDay}, ${displayDate} at ${displayTime}. – Amanda`,
    );
  } catch (err) {
    console.error("[notifications] reschedule SMS failed:", err);
  }
}

// ── Class booking confirmation ────────────────────────────────────────────

export async function sendClassBookingConfirmation(params: ClassNotifyParams) {
  const { className, startISO, durationMinutes, amountCents, client } = params;
  const quantity = params.quantity ?? 1;
  const displayDate = aestDate(startISO);
  const displayTime = aestTime(startISO);
  const price = `$${(amountCents / 100).toFixed(0)}`;
  const hours = Math.floor(durationMinutes / 60);
  const mins  = durationMinutes % 60;
  const duration = mins ? `${hours} hr ${mins} min` : `${hours} hours`;
  const ticketLabel = quantity === 1 ? "1 ticket" : `${quantity} tickets`;

  try {
    await sendEmail(
      client.email,
      "Your Cocoon class booking is confirmed ✨",
      buildClassConfirmationEmail({ client, className, displayDate, displayTime, price, duration, quantity }),
    );
  } catch (err) {
    console.error("[notifications] class confirmation email failed:", err);
  }

  try {
    await sendSMS(
      client.mobile,
      `Hi ${client.first_name}, your ${ticketLabel} to ${className} at Cocoon on ${displayDate} at ${displayTime} are confirmed. See you then! – Amanda`,
    );
  } catch (err) {
    console.error("[notifications] class confirmation SMS failed:", err);
  }
}

// ── Class booking cancellation ────────────────────────────────────────────

export async function sendClassBookingCancellation(params: Omit<ClassNotifyParams, "amountCents" | "durationMinutes">) {
  const { className, startISO, client } = params;
  const displayDate = aestDate(startISO);
  const displayTime = aestTime(startISO);

  try {
    await sendEmail(
      client.email,
      "Your Cocoon class booking has been cancelled",
      buildClassCancellationEmail({ client, className, displayDate, displayTime }),
    );
  } catch (err) {
    console.error("[notifications] class cancellation email failed:", err);
  }

  try {
    await sendSMS(
      client.mobile,
      `Hi ${client.first_name}, your ${className} at Cocoon on ${displayDate} has been cancelled. Sorry for any inconvenience – Amanda`,
    );
  } catch (err) {
    console.error("[notifications] class cancellation SMS failed:", err);
  }
}

// ── 48-hour appointment reminder ──────────────────────────────────────────

export interface ReminderParams {
  client: NotifyClient;
  serviceName: string;
  durationMinutes: number;
  startISO: string;
}

export async function sendAppointmentReminder(params: ReminderParams) {
  const { client, serviceName, durationMinutes, startISO } = params;
  const { displayDate, displayTime, displayDay, displayShortDate, duration } =
    buildDateParts(startISO, durationMinutes);

  try {
    await sendEmail(
      client.email,
      "Your Cocoon appointment is in 2 days ✨",
      buildReminderEmail({ client, serviceName, serviceLabel: "Service", displayDate, displayTime, duration }),
    );
  } catch (err) {
    console.error("[notifications] reminder email failed:", err);
  }

  if (client.mobile?.trim()) {
    await sendReminderSMS(client, serviceName, displayDay, displayShortDate, displayTime);
  }
}

export interface ClassReminderParams {
  client: NotifyClient;
  className: string;
  durationMinutes: number;
  startISO: string;
}

export async function sendClassReminder(params: ClassReminderParams) {
  const { client, className, durationMinutes, startISO } = params;
  const { displayDate, displayTime, displayDay, displayShortDate, duration } =
    buildDateParts(startISO, durationMinutes);

  try {
    await sendEmail(
      client.email,
      "Your Cocoon appointment is in 2 days ✨",
      buildReminderEmail({ client, serviceName: className, serviceLabel: "Class", displayDate, displayTime, duration }),
    );
  } catch (err) {
    console.error("[notifications] class reminder email failed:", err);
  }

  if (client.mobile?.trim()) {
    await sendReminderSMS(client, className, displayDay, displayShortDate, displayTime);
  }
}

function buildDateParts(startISO: string, durationMinutes: number) {
  const displayDate      = aestDate(startISO);
  const displayTime      = aestTime(startISO);
  const displayDay       = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane", weekday: "long",
  }).format(new Date(startISO));
  const displayShortDate = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane", day: "numeric", month: "long",
  }).format(new Date(startISO));
  const hrs  = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const duration = mins
    ? `${hrs > 0 ? `${hrs} hr ` : ""}${mins} min`
    : `${hrs} hour${hrs !== 1 ? "s" : ""}`;
  return { displayDate, displayTime, displayDay, displayShortDate, duration };
}

async function sendReminderSMS(
  client: NotifyClient,
  serviceName: string,
  displayDay: string,
  displayShortDate: string,
  displayTime: string,
) {
  // Primary template — aim for ≤160 chars
  const primary = `Hi ${client.first_name}, a reminder your ${serviceName} at Cocoon is in 2 days — ${displayDay} ${displayShortDate} at ${displayTime}. Questions? Reply to this message. – Amanda`;
  // Fallback for long service names
  const fallback = `Hi ${client.first_name}, reminder: ${serviceName} at Cocoon — ${displayDay} ${displayShortDate} at ${displayTime}. – Amanda`;

  const body = primary.length <= 160 ? primary : fallback.slice(0, 160);
  try {
    await sendSMS(client.mobile, body);
  } catch (err) {
    console.error("[notifications] reminder SMS failed:", err);
  }
}

// ── Email templates ───────────────────────────────────────────────────────

function emailWrapper(body: string) {
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
            ${body}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 0;">
            <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;color:#b0a499;font-size:16px;margin:0;">
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

function buildClassConfirmationEmail(p: {
  client: NotifyClient;
  className: string;
  displayDate: string;
  displayTime: string;
  price: string;
  duration: string;
  quantity: number;
}) {
  const ticketLabel = p.quantity === 1 ? "1 ticket" : `${p.quantity} tickets`;
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      You're booked in! ✨
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      Hi ${p.client.first_name}, we can't wait to see you at class.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8f5f2;border-radius:10px;padding:24px;margin-bottom:32px;">
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Class</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.className}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Tickets</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${ticketLabel}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Date</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayDate}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Time</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayTime}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Duration</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.duration}</strong>
      </td></tr>
      <tr><td>
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Amount Paid</span><br>
        <strong style="font-size:16px;color:#044e77;">${p.price}</strong>
      </td></tr>
    </table>
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
      <strong style="color:#1a1a1a;">Location</strong><br>
      Cocoon Skin &amp; Beauty<br>
      16 Bunderoo Circuit, Pimpama QLD 4209
    </p>
    <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
              border-top:1px solid #f0ebe4;padding-top:20px;">
      Need to cancel? Please contact Amanda at least 48 hours before your class.
    </p>
  `);
}

function buildClassCancellationEmail(p: {
  client: NotifyClient;
  className: string;
  displayDate: string;
  displayTime: string;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      Booking Cancelled
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      Hi ${p.client.first_name}, we're sorry to let you know that your booking has been cancelled.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8f5f2;border-radius:10px;padding:24px;margin-bottom:32px;">
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Class</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.className}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Date</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayDate}</strong>
      </td></tr>
      <tr><td>
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Time</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayTime}</strong>
      </td></tr>
    </table>
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
      We apologise for any inconvenience. We'd love to see you at a future class — contact Amanda to register your interest or book another session.
    </p>
    <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
              border-top:1px solid #f0ebe4;padding-top:20px;">
      Questions? Contact Amanda directly.<br>
      Cocoon Skin &amp; Beauty · 16 Bunderoo Circuit, Pimpama QLD 4209
    </p>
  `);
}

// ── Appointment confirmation email template ───────────────────────────────

function buildAppointmentConfirmationEmail(p: {
  client: NotifyClient;
  serviceName: string;
  displayDate: string;
  displayTime: string;
  duration: string;
  amountPaid: string;
  outstanding: number;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      You're confirmed! ✨
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      Hi ${p.client.first_name}, we can't wait to see you.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8f5f2;border-radius:10px;padding:24px;margin-bottom:32px;">
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Service</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.serviceName}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Date</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayDate}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Time</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayTime}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Duration</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.duration}</strong>
      </td></tr>
      <tr><td>
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Amount Paid</span><br>
        <strong style="font-size:16px;color:#044e77;">${p.amountPaid}</strong>
        ${p.outstanding > 0 ? `<br><span style="font-size:13px;color:#9a8f87;">$${(p.outstanding / 100).toFixed(0)} remaining due at appointment</span>` : ""}
      </td></tr>
    </table>
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
      <strong style="color:#1a1a1a;">Location</strong><br>
      Cocoon Skin &amp; Beauty<br>
      16 Bunderoo Circuit, Pimpama QLD 4209
    </p>
    <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
              border-top:1px solid #f0ebe4;padding-top:20px;">
      Need to reschedule or cancel? Please contact Amanda at least 48 hours before your appointment.
    </p>
  `);
}

// ── Reschedule email template ─────────────────────────────────────────────

function buildRescheduleEmail(p: {
  client: NotifyClient;
  serviceName: string;
  displayDate: string;
  displayTime: string;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      Your appointment has been rescheduled
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      Hi ${p.client.first_name}, your appointment has been moved to a new time. All the details are below.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8f5f2;border-radius:10px;padding:24px;margin-bottom:32px;">
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Service</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.serviceName}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">New Date</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayDate}</strong>
      </td></tr>
      <tr><td>
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">New Time</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayTime}</strong>
      </td></tr>
    </table>
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
      <strong style="color:#1a1a1a;">Location</strong><br>
      Cocoon Skin &amp; Beauty<br>
      16 Bunderoo Circuit, Pimpama QLD 4209
    </p>
    <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
              border-top:1px solid #f0ebe4;padding-top:20px;">
      Need to make further changes? Please contact Amanda directly.
    </p>
  `);
}

// ── Reminder email template ───────────────────────────────────────────────

function buildReminderEmail(p: {
  client: NotifyClient;
  serviceName: string;
  serviceLabel: string;
  displayDate: string;
  displayTime: string;
  duration: string;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      See you soon, ${p.client.first_name}!
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      This is a friendly reminder that your appointment is coming up in 2 days.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8f5f2;border-radius:10px;padding:24px;margin-bottom:32px;">
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">${p.serviceLabel}</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.serviceName}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Date</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayDate}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Time</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayTime}</strong>
      </td></tr>
      <tr><td>
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Duration</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.duration}</strong>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
      <tr>
        <td align="center" style="background:#044e77;border-radius:10px;padding:14px 32px;">
          <a href="https://book.cocoonskinandbeauty.com.au"
             style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;
                    font-family:'Jost',Arial,sans-serif;">
            View Booking →
          </a>
        </td>
      </tr>
    </table>

    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;
              background:#fff8f0;border-left:3px solid #fbb040;padding:12px 16px;
              border-radius:0 8px 8px 0;">
      If you need to reschedule or cancel, please contact Amanda as soon as possible.
      Changes less than 48 hours from your appointment can affect your deposit.
    </p>

    <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
              border-top:1px solid #f0ebe4;padding-top:20px;">
      Cocoon Skin &amp; Beauty · 16 Bunderoo Circuit, Pimpama QLD 4209<br>
      Questions? Email us at hello@cocoonskinandbeauty.com.au
    </p>
  `);
}

// ── Payment request email template ───────────────────────────────────────

function buildPaymentRequestEmail(p: {
  client: NotifyClient;
  serviceName: string;
  displayDate: string;
  displayTime: string;
  paymentUrl: string;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      Your booking is reserved ✨
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      Hi ${p.client.first_name}, Amanda has reserved a time for you at Cocoon.
      Complete your payment below to confirm your appointment.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8f5f2;border-radius:10px;padding:24px;margin-bottom:32px;">
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Service</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.serviceName}</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Date</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayDate}</strong>
      </td></tr>
      <tr><td>
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Time</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.displayTime}</strong>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
      <tr><td align="center">
        <a href="${p.paymentUrl}"
           style="display:inline-block;background:#044e77;color:#ffffff;font-size:15px;
                  font-weight:500;text-decoration:none;padding:14px 36px;border-radius:8px;">
          Pay Now
        </a>
      </td></tr>
    </table>
    <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
              border-top:1px solid #f0ebe4;padding-top:20px;">
      This payment link expires in 48 hours. If you have questions, contact Amanda directly.
    </p>
  `);
}

// ── Intake form submission notification (to Amanda) ───────────────────────

export async function sendIntakeFormNotification(params: {
  clientName: string;
  appointmentISO: string;
  serviceName: string;
  intakeAdminUrl: string;
}) {
  const { clientName, appointmentISO, serviceName, intakeAdminUrl } = params;
  const amandaEmail = process.env.AMANDA_EMAIL;
  if (!amandaEmail) {
    console.warn("[notifications] AMANDA_EMAIL not set — skipping intake form notification");
    return;
  }

  const displayDate = aestDate(appointmentISO);
  const displayTime = aestTime(appointmentISO);

  await sendEmail(
    amandaEmail,
    `Intake form submitted — ${clientName}`,
    emailWrapper(`
      <p style="color:#1a1a1a;font-size:15px;margin:0 0 8px;line-height:1.6;">
        <strong>${clientName}</strong> — ${serviceName}, ${displayDate} at ${displayTime}
      </p>
      <p style="color:#7a6f68;font-size:15px;margin:0 0 28px;line-height:1.6;">
        A consultation form has been submitted. Click below to review it.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <a href="${intakeAdminUrl}"
             style="display:inline-block;background:#044e77;color:#ffffff;font-size:15px;
                    font-weight:500;text-decoration:none;padding:14px 36px;border-radius:8px;">
            View Consultation Form
          </a>
        </td></tr>
      </table>
    `),
  );
}
