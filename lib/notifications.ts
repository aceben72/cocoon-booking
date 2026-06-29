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
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Cocoon Skin & Beauty <amanda@cocoonskinandbeauty.com.au>",
      reply_to: ["amanda@cocoonskinandbeauty.com.au"],
      to,
      subject,
      html,
    }),
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
  intakeFormUrl?: string | null;
  isNewClient?: boolean;
  client: NotifyClient;
}

export async function sendAppointmentConfirmation(params: AppointmentNotifyParams) {
  const { serviceName, durationMinutes, priceCents, amountPaidCents, startISO, intakeFormUrl, isNewClient, client } = params;
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
      buildAppointmentConfirmationEmail({ client, serviceName, displayDate, displayTime, duration, amountPaid, outstanding, intakeFormUrl: intakeFormUrl ?? null, isNewClient: isNewClient ?? false }),
    );
    console.log("[notifications] appointment confirmation email sent to:", client.email);
  } catch (err) {
    console.error("[notifications] appointment confirmation email failed for:", client.email, err);
  }

  console.log("[notifications] sending appointment confirmation SMS to:", client.mobile);
  try {
    await sendSMS(
      client.mobile,
      isNewClient
        ? `Hi ${client.first_name}, your ${serviceName} at Cocoon is confirmed for ${displayDate} at ${displayTime}. As a new client, please note your appointment starts at this time — the 15-minute consultation is included within your total appointment. See you then! – Amanda`
        : `Hi ${client.first_name}, your ${serviceName} at Cocoon is confirmed for ${displayDate} at ${displayTime}. See you then! – Amanda`,
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

// ── Class booking moved (admin reschedule) ───────────────────────────────

export interface ClassMoveParams {
  className: string;
  newStartISO: string;
  client: NotifyClient;
}

export async function sendClassBookingMoved(params: ClassMoveParams) {
  const { className, newStartISO, client } = params;
  const displayDate = aestDate(newStartISO);
  const displayTime = aestTime(newStartISO);
  const displayDay  = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
  }).format(new Date(newStartISO));

  try {
    await sendEmail(
      client.email,
      "Your Cocoon Make-Up Class has been rescheduled",
      buildClassMovedEmail({ client, className, displayDate, displayTime }),
    );
  } catch (err) {
    console.error("[notifications] class moved email failed:", err);
  }

  try {
    await sendSMS(
      client.mobile,
      `Hi ${client.first_name}, your Make-Up Class at Cocoon has been moved to ${displayDay}, ${displayDate} at ${displayTime}. Questions? Reply to this message. – Amanda`,
    );
  } catch (err) {
    console.error("[notifications] class moved SMS failed:", err);
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
  const primary = `Hi ${client.first_name}, a reminder your ${serviceName} at Cocoon is in 2 days — ${displayDay} ${displayShortDate} at ${displayTime}. If you need to make changes you must contact me ASAP. Changes with less than 48 hours notice can affect your deposit. – Amanda`;
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

function buildClassMovedEmail(p: {
  client: NotifyClient;
  className: string;
  displayDate: string;
  displayTime: string;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      Your class has been rescheduled
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      Hi ${p.client.first_name}, Amanda has moved your booking to a new session.
      Your updated details are below.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8f5f2;border-radius:10px;padding:24px;margin-bottom:32px;">
      <tr><td style="padding-bottom:12px;">
        <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Class</span><br>
        <strong style="font-size:16px;color:#1a1a1a;">${p.className}</strong>
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
      Questions? Contact Amanda directly at
      <a href="mailto:amanda@cocoonskinandbeauty.com.au"
         style="color:#044e77;text-decoration:none;">amanda@cocoonskinandbeauty.com.au</a>
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
  intakeFormUrl?: string | null;
  isNewClient?: boolean;
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
    ${p.intakeFormUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
      <tr><td>
        <p style="color:#1a1a1a;font-size:14px;font-weight:500;margin:0 0 8px;">
          Complete your consultation form
        </p>
        <p style="color:#7a6f68;font-size:13px;line-height:1.6;margin:0 0 16px;">
          As a new client, please complete your pre-appointment consultation form before you arrive.
          It only takes a few minutes and helps Amanda personalise your treatment.
        </p>
        <a href="${p.intakeFormUrl}"
           style="display:inline-block;background:#044e77;color:#ffffff;font-size:14px;
                  font-weight:500;text-decoration:none;padding:12px 28px;border-radius:8px;">
          Complete Intake Form →
        </a>
      </td></tr>
    </table>
    ` : ""}
    ${p.isNewClient ? `
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;
              background:#fff8f0;border-left:3px solid #fbb040;padding:12px 16px;
              border-radius:0 8px 8px 0;">
      A note for new clients: Your appointment starts at your booked time — there's no need to arrive early.
      The 15-minute consultation with Amanda is included within your total appointment duration.
    </p>
    ` : ""}
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
      Questions? Email us at amanda@cocoonskinandbeauty.com.au
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

// ── Internal: new appointment notification to Amanda ─────────────────────

export interface AdminBookingNotifyParams {
  serviceName: string;
  durationMinutes: number;
  startISO: string;
  isNewClient: boolean;
  notes?: string | null;
  client: NotifyClient;
}

export async function sendAdminBookingNotification(params: AdminBookingNotifyParams) {
  const to = process.env.AMANDA_EMAIL ?? "amanda@cocoonskinandbeauty.com.au";
  const { serviceName, durationMinutes, startISO, isNewClient, notes, client } = params;
  const displayDate = aestDate(startISO);
  const displayTime = aestTime(startISO);
  const hrs  = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const duration = mins
    ? `${hrs > 0 ? `${hrs} hr ` : ""}${mins} min`
    : `${hrs} hour${hrs !== 1 ? "s" : ""}`;
  try {
    await sendEmail(
      to,
      `New booking – ${client.first_name} ${client.last_name}`,
      buildAdminBookingEmail({ client, serviceName, displayDate, displayTime, duration, isNewClient, notes: notes ?? null }),
    );
  } catch (err) {
    console.error("[notifications] admin booking notification failed:", err);
  }
}

// ── Internal: new class booking notification to Amanda ────────────────────

export interface AdminClassNotifyParams {
  className: string;
  startISO: string;
  quantity: number;
  client: NotifyClient;
}

export async function sendAdminClassNotification(params: AdminClassNotifyParams) {
  const to = process.env.AMANDA_EMAIL ?? "amanda@cocoonskinandbeauty.com.au";
  const { className, startISO, quantity, client } = params;
  const displayDate = aestDate(startISO);
  const displayTime = aestTime(startISO);
  const ticketLabel = quantity === 1 ? "1 ticket" : `${quantity} tickets`;
  try {
    await sendEmail(
      to,
      `New class booking – ${client.first_name} ${client.last_name}`,
      buildAdminClassEmail({ client, className, displayDate, displayTime, ticketLabel }),
    );
  } catch (err) {
    console.error("[notifications] admin class notification failed:", err);
  }
}

// ── Client: appointment cancellation email + SMS ──────────────────────────

export interface AppointmentCancellationParams {
  serviceName: string;
  startISO: string;
  client: NotifyClient;
}

export async function sendAppointmentCancellation(params: AppointmentCancellationParams) {
  const { serviceName, startISO, client } = params;
  const displayDate = aestDate(startISO);
  const displayTime = aestTime(startISO);
  try {
    await sendEmail(
      client.email,
      "Your Cocoon appointment has been cancelled",
      buildAppointmentCancellationEmail({ client, serviceName, displayDate, displayTime }),
    );
  } catch (err) {
    console.error("[notifications] cancellation email failed:", err);
  }
  try {
    await sendSMS(
      client.mobile,
      `Hi ${client.first_name}, your ${serviceName} appointment at Cocoon on ${displayDate} at ${displayTime} has been cancelled. Please contact Amanda to rebook. – Amanda`,
    );
  } catch (err) {
    console.error("[notifications] cancellation SMS failed:", err);
  }
}

// ── Client: pending_payment appointment cancellation (non-payment) ────────

export async function sendPendingPaymentCancellation(params: AppointmentCancellationParams) {
  const { serviceName, startISO, client } = params;
  const displayDate = aestDate(startISO);
  const displayTime = aestTime(startISO);
  if (client.email) {
    try {
      await sendEmail(
        client.email,
        "Your Cocoon booking has been cancelled",
        buildPendingPaymentCancellationEmail({ client, serviceName, displayDate, displayTime }),
      );
    } catch (err) {
      console.error("[notifications] pending payment cancellation email failed:", err);
    }
  }
  if (client.mobile) {
    try {
      await sendSMS(
        client.mobile,
        `Hi ${client.first_name}, your Cocoon booking for ${serviceName} on ${displayDate} has been cancelled as payment wasn't received. Rebook at book.cocoonskinandbeauty.com.au`,
      );
    } catch (err) {
      console.error("[notifications] pending payment cancellation SMS failed:", err);
    }
  }
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

// ── Admin notification email templates ────────────────────────────────────

function adminRow(label: string, value: string) {
  return `<tr>
    <td style="padding:7px 20px 7px 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;width:110px;vertical-align:top;white-space:nowrap;">${label}</td>
    <td style="padding:7px 0;font-size:14px;color:#1a1a1a;line-height:1.5;">${value}</td>
  </tr>`;
}

function buildAdminBookingEmail(p: {
  client: NotifyClient;
  serviceName: string;
  displayDate: string;
  displayTime: string;
  duration: string;
  isNewClient: boolean;
  notes: string | null;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 20px;">
      New booking
    </h1>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${adminRow("Client", `${p.client.first_name} ${p.client.last_name}`)}
      ${adminRow("Service", p.serviceName)}
      ${adminRow("Date", p.displayDate)}
      ${adminRow("Time", p.displayTime)}
      ${adminRow("Duration", p.duration)}
      ${adminRow("Email", `<a href="mailto:${p.client.email}" style="color:#044e77;text-decoration:none;">${p.client.email}</a>`)}
      ${adminRow("Mobile", `<a href="tel:${p.client.mobile}" style="color:#044e77;text-decoration:none;">${p.client.mobile}</a>`)}
      ${adminRow("New Client", p.isNewClient ? "<strong style=\"color:#044e77;\">Yes</strong>" : "No")}
      ${p.notes ? adminRow("Notes", `<span style="color:#7a6f68;">${p.notes}</span>`) : ""}
    </table>
  `);
}

function buildAdminClassEmail(p: {
  client: NotifyClient;
  className: string;
  displayDate: string;
  displayTime: string;
  ticketLabel: string;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 20px;">
      New class booking
    </h1>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${adminRow("Client", `${p.client.first_name} ${p.client.last_name}`)}
      ${adminRow("Class", p.className)}
      ${adminRow("Date", p.displayDate)}
      ${adminRow("Time", p.displayTime)}
      ${adminRow("Tickets", p.ticketLabel)}
      ${adminRow("Email", `<a href="mailto:${p.client.email}" style="color:#044e77;text-decoration:none;">${p.client.email}</a>`)}
      ${adminRow("Mobile", `<a href="tel:${p.client.mobile}" style="color:#044e77;text-decoration:none;">${p.client.mobile}</a>`)}
    </table>
  `);
}

function buildAppointmentCancellationEmail(p: {
  client: NotifyClient;
  serviceName: string;
  displayDate: string;
  displayTime: string;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      Appointment Cancelled
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      Hi ${p.client.first_name}, we're sorry to let you know that your upcoming appointment has been cancelled.
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
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
      We sincerely apologise for any inconvenience. We'd love to find you another time —
      please reach out to Amanda directly to rebook.
    </p>
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
      <strong style="color:#1a1a1a;">Contact Amanda</strong><br>
      <a href="mailto:amanda@cocoonskinandbeauty.com.au" style="color:#044e77;text-decoration:none;">amanda@cocoonskinandbeauty.com.au</a><br>
      Cocoon Skin &amp; Beauty · 16 Bunderoo Circuit, Pimpama QLD 4209
    </p>
    <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
              border-top:1px solid #f0ebe4;padding-top:20px;">
      We look forward to welcoming you back to Cocoon soon.
    </p>
  `);
}

function buildPendingPaymentCancellationEmail(p: {
  client: NotifyClient;
  serviceName: string;
  displayDate: string;
  displayTime: string;
}) {
  return emailWrapper(`
    <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;
               font-style:italic;color:#044e77;margin:0 0 8px;">
      Booking Cancelled
    </h1>
    <p style="color:#7a6f68;font-size:15px;margin:0 0 32px;line-height:1.6;">
      Hi ${p.client.first_name}, we're letting you know that your booking has been cancelled as payment was not received within the required time.
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
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
      If you'd still like to book, we'd love to see you — you can rebook online at
      <a href="https://book.cocoonskinandbeauty.com.au" style="color:#044e77;text-decoration:none;">book.cocoonskinandbeauty.com.au</a>.
    </p>
    <p style="color:#7a6f68;font-size:14px;line-height:1.7;margin:0 0 24px;">
      If you have any questions, please don't hesitate to get in touch.
    </p>
    <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
              border-top:1px solid #f0ebe4;padding-top:20px;">
      Warm regards,<br>
      Amanda<br>
      Cocoon Skin &amp; Beauty
    </p>
  `);
}

// ── Mailchimp ─────────────────────────────────────────────────────────────

const MAILCHIMP_AUDIENCE_ID = "89c5fafdee";

const MAILCHIMP_TAG_MAP: Record<string, { new: string; returning: string }> = {
  facials:                 { new: "post-facial-new",             returning: "post-facial-returning" },
  "treatment-plans":       { new: "post-treatment-plan-new",     returning: "post-treatment-plan-returning" },
  "make-up":               { new: "post-makeup-application-new", returning: "post-makeup-application-returning" },
  masterclass:             { new: "post-makeup-class-new",       returning: "post-makeup-class-returning" },
  mother_daughter:         { new: "post-makeup-class-new",       returning: "post-makeup-class-returning" },
  "mother-daughter":       { new: "post-makeup-class-new",       returning: "post-makeup-class-returning" },
  "brow-treatments":       { new: "post-brow-new",               returning: "post-brow-returning" },
  "led-light-treatments":  { new: "post-led-new",                returning: "post-led-returning" },
};

export async function tagMailchimpFacialBooked(params: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  if (!apiKey) return;

  const server = apiKey.split("-").pop() ?? "us3";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const subscriberHash = (require("crypto") as typeof import("crypto"))
    .createHash("md5")
    .update(params.email.toLowerCase())
    .digest("hex");

  const base = `https://${server}.api.mailchimp.com/3.0`;
  const auth = Buffer.from(`anystring:${apiKey}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  await fetch(`${base}/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      email_address: params.email.toLowerCase(),
      status_if_new: "subscribed",
      merge_fields: { FNAME: params.firstName, LNAME: params.lastName },
    }),
  });

  await fetch(`${base}/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tags: [{ name: "facial-booked", status: "active" }] }),
  });
}

export async function upsertMailchimpContact(params: {
  email: string;
  firstName: string;
  lastName: string;
  serviceCategory: string;
  isNewClient: boolean;
}) {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  if (!apiKey) return;

  const server = apiKey.split("-").pop() ?? "us3";
  const tags = MAILCHIMP_TAG_MAP[params.serviceCategory];
  if (!tags) return;

  const tag = params.isNewClient ? tags.new : tags.returning;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const subscriberHash = (require("crypto") as typeof import("crypto"))
    .createHash("md5")
    .update(params.email.toLowerCase())
    .digest("hex");

  const base = `https://${server}.api.mailchimp.com/3.0`;
  const auth = Buffer.from(`anystring:${apiKey}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  await fetch(`${base}/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      email_address: params.email.toLowerCase(),
      status_if_new: "subscribed",
      merge_fields: { FNAME: params.firstName, LNAME: params.lastName },
    }),
  });

  await fetch(`${base}/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tags: [{ name: tag, status: "active" }] }),
  });
}
