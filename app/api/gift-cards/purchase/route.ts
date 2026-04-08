import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateGiftCardCode } from "@/lib/gift-cards";

const VALID_DENOMINATIONS = [5000, 10000, 15000, 20000]; // $50, $100, $150, $200

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const {
    denomination_cents,
    purchaser_name,
    purchaser_email,
    recipient_name,
    recipient_email,
    personal_message,
    square_payment_token,
  } = body as {
    denomination_cents?: number;
    purchaser_name?: string;
    purchaser_email?: string;
    recipient_name?: string;
    recipient_email?: string;
    personal_message?: string;
    square_payment_token?: string;
  };

  // ── Validate ──────────────────────────────────────────────────
  if (!denomination_cents || !VALID_DENOMINATIONS.includes(denomination_cents)) {
    return NextResponse.json(
      { error: "Please select a valid denomination ($50, $100, $150, or $200)." },
      { status: 400 },
    );
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

  const message = personal_message?.slice(0, 200) || null;

  // ── Square payment ────────────────────────────────────────────
  const squareToken = process.env.SQUARE_ACCESS_TOKEN;
  const squareLocationId = process.env.SQUARE_LOCATION_ID;
  const squareEnv = process.env.SQUARE_ENVIRONMENT ?? "sandbox";

  if (squareToken && squareLocationId) {
    try {
      const { SquareClient, SquareEnvironment } = await import("square");
      const squareClient = new SquareClient({
        token: squareToken,
        environment: squareEnv === "production"
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
      });

      const idempotencyKey = crypto.randomUUID().replace(/-/g, "").substring(0, 45);

      await squareClient.payments.create({
        sourceId: square_payment_token,
        idempotencyKey,
        amountMoney: {
          amount: BigInt(denomination_cents),
          currency: "AUD",
        },
        locationId: squareLocationId,
        buyerEmailAddress: purchaser_email,
        note: `Cocoon Gift Card — ${formatDollars(denomination_cents)} for ${recipient_name}`,
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Payment failed";
      return NextResponse.json({ error: `Payment failed: ${message}` }, { status: 402 });
    }
  }

  // ── Generate unique gift card code ───────────────────────────
  const db = supabase();
  let code = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGiftCardCode();
    const { data: existing } = await db
      .from("gift_cards")
      .select("id")
      .eq("code", candidate)
      .single();
    if (!existing) { code = candidate; break; }
  }
  if (!code) {
    return NextResponse.json({ error: "Failed to generate unique gift card code." }, { status: 500 });
  }

  // ── Insert gift card ──────────────────────────────────────────
  const { data: giftCard, error: insertErr } = await db
    .from("gift_cards")
    .insert({
      code,
      initial_value_cents: denomination_cents,
      remaining_value_cents: denomination_cents,
      purchaser_name: purchaser_name.trim(),
      purchaser_email: purchaser_email.trim().toLowerCase(),
      recipient_name: recipient_name.trim(),
      recipient_email: recipient_email.trim().toLowerCase(),
      personal_message: message,
      is_active: true,
      source: "customer",
    })
    .select("id, code")
    .single();

  if (insertErr || !giftCard) {
    console.error("[gift-cards/purchase] insert failed:", insertErr);
    return NextResponse.json(
      { error: "Gift card created but database record failed. Please contact support." },
      { status: 500 },
    );
  }

  // ── Send emails (fire & forget) ───────────────────────────────
  sendGiftCardEmails({
    code,
    denomination_cents,
    purchaser_name: purchaser_name.trim(),
    purchaser_email: purchaser_email.trim(),
    recipient_name: recipient_name.trim(),
    recipient_email: recipient_email.trim(),
    personal_message: message,
  }).catch(console.error);

  return NextResponse.json({
    success: true,
    code,
    denomination_cents,
    recipient_name: recipient_name.trim(),
    recipient_email: recipient_email.trim(),
  });
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

async function sendGiftCardEmails(params: {
  code: string;
  denomination_cents: number;
  purchaser_name: string;
  purchaser_email: string;
  recipient_name: string;
  recipient_email: string;
  personal_message: string | null;
}) {
  const {
    code, denomination_cents, purchaser_name, purchaser_email,
    recipient_name, recipient_email, personal_message,
  } = params;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);
  const valueDisplay = formatDollars(denomination_cents);

  // Recipient email
  await resend.emails.send({
    from: "Cocoon Skin & Beauty <amanda@cocoonskinandbeauty.com.au>",
    reply_to: "amanda@cocoonskinandbeauty.com.au",
    to: recipient_email,
    subject: "You've received a Cocoon gift card 🎁",
    html: buildRecipientEmail({ code, valueDisplay, purchaser_name, recipient_name, personal_message }),
  }).catch(console.error);

  // Purchaser confirmation email
  await resend.emails.send({
    from: "Cocoon Skin & Beauty <amanda@cocoonskinandbeauty.com.au>",
    reply_to: "amanda@cocoonskinandbeauty.com.au",
    to: purchaser_email,
    subject: "Your Cocoon gift card purchase is confirmed ✨",
    html: buildPurchaserEmail({ code, valueDisplay, purchaser_name, recipient_name, recipient_email }),
  }).catch(console.error);
}

function buildRecipientEmail(params: {
  code: string;
  valueDisplay: string;
  purchaser_name: string;
  recipient_name: string;
  personal_message: string | null;
}) {
  const { code, valueDisplay, purchaser_name, recipient_name, personal_message } = params;
  const personalMessageBlock = personal_message
    ? `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#fdf8f0;border-left:4px solid #fbb040;border-radius:0 8px 8px 0;
                    padding:20px;margin-bottom:28px;">
        <tr><td>
          <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;font-style:italic;
                    color:#7a6f68;margin:0;line-height:1.7;">"${personal_message}"</p>
          <p style="font-size:13px;color:#b0a499;margin:8px 0 0;font-style:italic;">— ${purchaser_name}</p>
        </td></tr>
      </table>`
    : "";

  return `
<!DOCTYPE html>
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
              You've received a gift from ${purchaser_name} 🎁
            </h1>
            <p style="color:#7a6f68;font-size:15px;margin:0 0 28px;line-height:1.6;">
              Hi ${recipient_name}, someone special is treating you to a Cocoon experience.
            </p>

            ${personalMessageBlock}

            <!-- Gift card code -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8f5f2;border-radius:12px;padding:28px;margin-bottom:28px;text-align:center;">
              <tr>
                <td>
                  <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;margin:0 0 12px;">
                    Your Gift Card Code
                  </p>
                  <p style="font-family:'Courier New',monospace;font-size:26px;font-weight:700;
                             color:#044e77;letter-spacing:4px;margin:0 0 12px;word-break:break-all;">
                    ${code}
                  </p>
                  <p style="font-size:15px;color:#7a6f68;margin:0;">
                    Loaded with <strong style="color:#044e77;">${valueDisplay}</strong>
                  </p>
                </td>
              </tr>
            </table>

            <!-- Redemption instructions -->
            <p style="color:#3a3330;font-size:14px;line-height:1.8;margin:0 0 24px;">
              To redeem, simply book a Cocoon treatment online and enter your gift card code at checkout.
              Your gift card <strong>never expires</strong> and can be used across multiple bookings
              until the balance is fully redeemed.
            </p>

            <!-- Book now button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td align="center" style="background:#044e77;border-radius:10px;padding:14px 32px;">
                  <a href="https://book.cocoonskinandbeauty.com.au"
                     style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;
                            font-family:'Jost',Arial,sans-serif;">
                    Book Your Treatment →
                  </a>
                </td>
              </tr>
            </table>

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

function buildPurchaserEmail(params: {
  code: string;
  valueDisplay: string;
  purchaser_name: string;
  recipient_name: string;
  recipient_email: string;
}) {
  const { code, valueDisplay, purchaser_name, recipient_name, recipient_email } = params;

  return `
<!DOCTYPE html>
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
              Gift card confirmed ✨
            </h1>
            <p style="color:#7a6f68;font-size:15px;margin:0 0 28px;line-height:1.6;">
              Hi ${purchaser_name}, you've gifted <strong>${recipient_name}</strong> a
              <strong>${valueDisplay}</strong> Cocoon gift card — what a lovely treat!
            </p>

            <!-- Summary -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8f5f2;border-radius:12px;padding:24px;margin-bottom:28px;">
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Recipient</span><br>
                  <strong style="font-size:15px;color:#1a1a1a;">${recipient_name}</strong>
                  <span style="font-size:13px;color:#9a8f87;"> (${recipient_email})</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Gift Card Value</span><br>
                  <strong style="font-size:15px;color:#044e77;">${valueDisplay}</strong>
                </td>
              </tr>
              <tr>
                <td>
                  <span style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#b0a499;">Gift Card Code</span><br>
                  <strong style="font-family:'Courier New',monospace;font-size:18px;color:#1a1a1a;
                                 letter-spacing:3px;">${code}</strong>
                </td>
              </tr>
            </table>

            <p style="color:#3a3330;font-size:14px;line-height:1.8;margin:0 0 24px;">
              We've sent the gift card directly to <strong>${recipient_email}</strong>.
              The gift card never expires and can be redeemed online at booking.
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
