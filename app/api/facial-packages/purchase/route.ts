import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generatePackageCode, PACKAGE_META } from "@/lib/facial-packages";

const VALID_TYPES = ["indulge", "opulence"] as const;
type PackageType = typeof VALID_TYPES[number];

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const {
    package_type,
    purchaser_name,
    purchaser_email,
    recipient_name,
    recipient_email,
    personal_message,
    square_payment_token,
  } = body as {
    package_type?: string;
    purchaser_name?: string;
    purchaser_email?: string;
    recipient_name?: string;
    recipient_email?: string;
    personal_message?: string;
    square_payment_token?: string;
  };

  // ── Validate ──────────────────────────────────────────────────
  if (!package_type || !VALID_TYPES.includes(package_type as PackageType)) {
    return NextResponse.json({ error: "Please select a valid package." }, { status: 400 });
  }
  if (!purchaser_name?.trim()) {
    return NextResponse.json({ error: "Your name is required." }, { status: 400 });
  }
  if (!purchaser_email?.trim()) {
    return NextResponse.json({ error: "Your email is required." }, { status: 400 });
  }
  if (!recipient_name?.trim()) {
    return NextResponse.json({ error: "Recipient's name is required." }, { status: 400 });
  }
  if (!recipient_email?.trim()) {
    return NextResponse.json({ error: "Recipient's email is required." }, { status: 400 });
  }
  if (!square_payment_token?.trim()) {
    return NextResponse.json({ error: "Payment details are required." }, { status: 400 });
  }

  const type = package_type as PackageType;
  const meta = PACKAGE_META[type];
  const message = personal_message?.slice(0, 200) || null;

  // ── Square payment ────────────────────────────────────────────
  const squareToken = process.env.SQUARE_ACCESS_TOKEN;
  const squareLocationId = process.env.SQUARE_LOCATION_ID;
  const squareEnv = process.env.SQUARE_ENVIRONMENT ?? "sandbox";
  let squarePaymentId: string | null = null;

  if (squareToken && squareLocationId) {
    try {
      const { SquareClient, SquareEnvironment } = await import("square");
      const squareClient = new SquareClient({
        token: squareToken,
        environment:
          squareEnv === "production"
            ? SquareEnvironment.Production
            : SquareEnvironment.Sandbox,
      });

      const idempotencyKey = crypto.randomUUID().replace(/-/g, "").substring(0, 45);

      const { payment } = await squareClient.payments.create({
        sourceId: square_payment_token,
        idempotencyKey,
        amountMoney: {
          amount: BigInt(meta.priceCents),
          currency: "AUD",
        },
        locationId: squareLocationId,
        buyerEmailAddress: purchaser_email,
        note: `${meta.label} (4 uses) for ${recipient_name}`,
      });

      squarePaymentId = payment?.id ?? null;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Payment failed";
      return NextResponse.json({ error: `Payment failed: ${errMsg}` }, { status: 402 });
    }
  }

  // ── Resolve service UUID ─────────────────────────────────────
  const db = supabase();
  const { data: dbService, error: svcErr } = await db
    .from("services")
    .select("id")
    .eq("name", meta.serviceName)
    .single();

  if (svcErr || !dbService) {
    console.error("[facial-packages/purchase] service lookup failed:", svcErr);
    return NextResponse.json(
      { error: "Service not found in database." },
      { status: 500 },
    );
  }

  // ── Generate unique code ─────────────────────────────────────
  let code = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generatePackageCode();
    const { data: existing } = await db
      .from("facial_packages")
      .select("id")
      .eq("code", candidate)
      .single();
    if (!existing) { code = candidate; break; }
  }
  if (!code) {
    return NextResponse.json(
      { error: "Failed to generate unique package code." },
      { status: 500 },
    );
  }

  // ── Insert record ─────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const { data: pkg, error: insertErr } = await db
    .from("facial_packages")
    .insert({
      code,
      package_type: type,
      service_id: dbService.id,
      purchaser_name: purchaser_name.trim(),
      purchaser_email: purchaser_email.trim().toLowerCase(),
      recipient_name: recipient_name.trim(),
      recipient_email: recipient_email.trim().toLowerCase(),
      personal_message: message,
      total_uses: 4,
      remaining_uses: 4,
      square_payment_id: squarePaymentId,
      amount_paid_cents: meta.priceCents,
      expires_at: expiresAt,
    })
    .select("id, code")
    .single();

  if (insertErr || !pkg) {
    console.error("[facial-packages/purchase] insert failed:", insertErr);
    return NextResponse.json(
      { error: "Package created but database record failed. Please contact support." },
      { status: 500 },
    );
  }

  // ── Send emails (fire & forget) ───────────────────────────────
  sendPackageEmails({
    code,
    type,
    meta,
    expiresAt,
    purchaser_name: purchaser_name.trim(),
    purchaser_email: purchaser_email.trim(),
    recipient_name: recipient_name.trim(),
    recipient_email: recipient_email.trim(),
    personal_message: message,
  }).catch(console.error);

  return NextResponse.json({
    success: true,
    code,
    package_type: type,
    recipient_name: recipient_name.trim(),
    recipient_email: recipient_email.trim(),
    expires_at: expiresAt,
  });
}

// ── Email helpers ────────────────────────────────────────────────────────────

type PackageMeta = typeof PACKAGE_META[keyof typeof PACKAGE_META];

async function sendPackageEmails(params: {
  code: string;
  type: PackageType;
  meta: PackageMeta;
  expiresAt: string;
  purchaser_name: string;
  purchaser_email: string;
  recipient_name: string;
  recipient_email: string;
  personal_message: string | null;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);

  const expiryDisplay = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(params.expiresAt));

  // Recipient email
  await resend.emails.send({
    from: "Cocoon Skin & Beauty <amanda@cocoonskinandbeauty.com.au>",
    replyTo: "amanda@cocoonskinandbeauty.com.au",
    to: params.recipient_email,
    subject: `You've received a Cocoon ${params.meta.label} ✨`,
    html: buildRecipientEmail({ ...params, expiryDisplay }),
  }).catch(console.error);

  // Purchaser confirmation
  await resend.emails.send({
    from: "Cocoon Skin & Beauty <amanda@cocoonskinandbeauty.com.au>",
    replyTo: "amanda@cocoonskinandbeauty.com.au",
    to: params.purchaser_email,
    subject: `Your ${params.meta.label} purchase is confirmed ✨`,
    html: buildPurchaserEmail({ ...params, expiryDisplay }),
  }).catch(console.error);
}

function buildRecipientEmail(params: {
  code: string;
  meta: PackageMeta;
  expiryDisplay: string;
  purchaser_name: string;
  recipient_name: string;
  personal_message: string | null;
}) {
  const { code, meta, expiryDisplay, purchaser_name, recipient_name, personal_message } = params;

  const messageBlock = personal_message
    ? `<table width="100%" cellpadding="0" cellspacing="0"
             style="background:#fdf8f0;border-left:4px solid #fbb040;border-radius:0 8px 8px 0;
                    padding:20px;margin-bottom:28px;">
        <tr><td>
          <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;font-style:italic;
                    color:#7a6f68;margin:0;line-height:1.7;">"${personal_message}"</p>
          <p style="font-size:13px;color:#b0a499;margin:8px 0 0;font-style:italic;">— ${purchaser_name}</p>
        </td></tr>
      </table>`
    : "";

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
              You've received a facial package ✨
            </h1>
            <p style="color:#7a6f68;font-size:15px;margin:0 0 28px;line-height:1.6;">
              Hi ${recipient_name}, ${purchaser_name} has gifted you a
              <strong style="color:#1a1a1a;">${meta.label}</strong> —
              four luxurious ${meta.serviceName} appointments for you to enjoy.
            </p>

            ${messageBlock}

            <!-- Package code -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8f5f2;border-radius:12px;padding:28px;margin-bottom:24px;text-align:center;">
              <tr>
                <td>
                  <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;margin:0 0 12px;">
                    Your Package Code
                  </p>
                  <p style="font-family:'Courier New',monospace;font-size:26px;font-weight:700;
                             color:#044e77;letter-spacing:4px;margin:0 0 16px;word-break:break-all;">
                    ${code}
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e0d8;padding-top:16px;margin-top:4px;">
                    <tr>
                      <td style="text-align:center;padding:0 12px;">
                        <p style="font-size:12px;color:#b0a499;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">Applies to</p>
                        <p style="font-size:14px;color:#1a1a1a;margin:0;font-weight:500;">${meta.serviceName}</p>
                      </td>
                      <td style="text-align:center;padding:0 12px;border-left:1px solid #e8e0d8;border-right:1px solid #e8e0d8;">
                        <p style="font-size:12px;color:#b0a499;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">Appointments</p>
                        <p style="font-size:14px;color:#1a1a1a;margin:0;font-weight:500;">4 included</p>
                      </td>
                      <td style="text-align:center;padding:0 12px;">
                        <p style="font-size:12px;color:#b0a499;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">Expires</p>
                        <p style="font-size:14px;color:#1a1a1a;margin:0;font-weight:500;">${expiryDisplay}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Instructions -->
            <p style="color:#3a3330;font-size:14px;font-weight:600;margin:0 0 8px;">
              How to redeem
            </p>
            <ol style="color:#3a3330;font-size:14px;line-height:2;margin:0 0 24px;padding-left:20px;">
              <li>Click the button below to open the booking page for your ${meta.serviceName}.</li>
              <li>Choose your preferred date and time, then fill in your details.</li>
              <li>At the payment step, enter your package code in the <strong>Facial Package Code</strong> field.</li>
              <li>Your appointment will be confirmed with no charge — the package covers the full cost.</li>
            </ol>

            <!-- Book button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td align="center" style="background:#044e77;border-radius:10px;padding:14px 32px;">
                  <a href="${meta.bookingUrl}"
                     style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;
                            font-family:'Jost',Arial,sans-serif;">
                    Book Your ${meta.serviceName} →
                  </a>
                </td>
              </tr>
            </table>

            <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
                      border-top:1px solid #f0ebe4;padding-top:20px;">
              This package expires on <strong>${expiryDisplay}</strong> and can only be used
              for ${meta.serviceName} appointments. Keep this email as your record.<br><br>
              Cocoon Skin & Beauty · Pimpama, QLD<br>
              Questions? Email us at hello@cocoonskinandbeauty.com.au
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

function buildPurchaserEmail(params: {
  code: string;
  meta: PackageMeta;
  expiryDisplay: string;
  purchaser_name: string;
  recipient_name: string;
  recipient_email: string;
}) {
  const { code, meta, expiryDisplay, purchaser_name, recipient_name, recipient_email } = params;

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
              Package purchase confirmed ✨
            </h1>
            <p style="color:#7a6f68;font-size:15px;margin:0 0 28px;line-height:1.6;">
              Hi ${purchaser_name}, your <strong>${meta.label}</strong> has been purchased
              for <strong>${recipient_name}</strong> — what a wonderful gift!
            </p>

            <!-- Summary -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8f5f2;border-radius:12px;padding:24px;margin-bottom:28px;">
              <tr>
                <td style="padding-bottom:14px;border-bottom:1px solid #e8e0d8;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Package</span><br>
                  <strong style="font-size:15px;color:#1a1a1a;">${meta.label}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 0;border-bottom:1px solid #e8e0d8;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Recipient</span><br>
                  <strong style="font-size:15px;color:#1a1a1a;">${recipient_name}</strong>
                  <span style="font-size:13px;color:#9a8f87;"> (${recipient_email})</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 0;border-bottom:1px solid #e8e0d8;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Appointments included</span><br>
                  <strong style="font-size:15px;color:#1a1a1a;">4 × ${meta.serviceName}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 0;border-bottom:1px solid #e8e0d8;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Expires</span><br>
                  <strong style="font-size:15px;color:#1a1a1a;">${expiryDisplay}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding-top:14px;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Package Code</span><br>
                  <strong style="font-family:'Courier New',monospace;font-size:18px;color:#044e77;
                                 letter-spacing:3px;">${code}</strong>
                </td>
              </tr>
            </table>

            <p style="color:#3a3330;font-size:14px;line-height:1.8;margin:0 0 24px;">
              We've sent the package details and redemption instructions directly to
              <strong>${recipient_email}</strong>.
            </p>

            <p style="color:#9a8f87;font-size:13px;line-height:1.7;margin:0;
                      border-top:1px solid #f0ebe4;padding-top:20px;">
              Cocoon Skin & Beauty · Pimpama, QLD<br>
              Questions? Email us at hello@cocoonskinandbeauty.com.au
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
