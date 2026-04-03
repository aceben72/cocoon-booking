import { createClient } from "@supabase/supabase-js";

export interface GiftCard {
  id: string;
  code: string;
  initial_value_cents: number;
  remaining_value_cents: number;
  purchaser_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GiftCardValidation {
  valid: boolean;
  giftCard?: GiftCard;
  error?: string;
}

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Generates a human-readable gift card code in the format GIFT-XXXX-XXXX */
export function generateGiftCardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit I, O, 0, 1 for clarity
  const seg = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `GIFT-${seg()}-${seg()}`;
}

/**
 * Validates a gift card code server-side.
 * Returns the card if it exists, is active, and has remaining balance.
 */
export async function validateGiftCard(code: string): Promise<GiftCardValidation> {
  const normalised = code.trim().toUpperCase();

  const { data, error } = await supabase()
    .from("gift_cards")
    .select("*")
    .eq("code", normalised)
    .single();

  if (error || !data) {
    return { valid: false, error: "Gift card not found." };
  }

  const card = data as GiftCard;

  if (!card.is_active) {
    return { valid: false, error: "This gift card has been deactivated." };
  }

  if (card.remaining_value_cents <= 0) {
    return { valid: false, error: "This gift card has no remaining balance." };
  }

  return { valid: true, giftCard: card };
}
