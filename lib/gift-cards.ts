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

/** Codes are stored upper case; staff and clients type them any old way. Same rule as the redemption RPC. */
export function normaliseGiftCardCode(code: string): string {
  return code.replace(/\s/g, "").toUpperCase();
}

/**
 * Card status for display. A card used down to $0 stays is_active = true:
 * "used" comes from the balance; "deactivated" only from Amanda's toggle.
 */
export function giftCardStatus(card: Pick<GiftCard, "is_active" | "remaining_value_cents">): "active" | "used" | "deactivated" {
  if (!card.is_active) return "deactivated";
  return card.remaining_value_cents <= 0 ? "used" : "active";
}

/** Why a card can't be redeemed, or null if it can. */
export function giftCardProblem(card: Pick<GiftCard, "is_active" | "remaining_value_cents">): string | null {
  const s = giftCardStatus(card);
  if (s === "deactivated") return "This gift card has been deactivated.";
  if (s === "used") return "This gift card has no remaining balance.";
  return null;
}

/**
 * Validates a gift card code server-side.
 * Returns the card if it exists, is active, and has remaining balance.
 */
export async function validateGiftCard(code: string): Promise<GiftCardValidation> {
  const normalised = normaliseGiftCardCode(code);

  const { data, error } = await supabase()
    .from("gift_cards")
    .select("*")
    .eq("code", normalised)
    .single();

  if (error || !data) {
    return { valid: false, error: "Gift card not found." };
  }

  const card = data as GiftCard;
  const problem = giftCardProblem(card);
  if (problem) return { valid: false, error: problem };

  return { valid: true, giftCard: card };
}

export interface AdminGiftCardSummary {
  id: string;
  code: string;
  initial_value_cents: number;
  remaining_value_cents: number;
  is_active: boolean;
  purchaser_name: string | null;
  purchaser_email: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  created_at: string;
  /** null = can be redeemed */
  problem: string | null;
}

const SUMMARY_COLUMNS =
  "id, code, initial_value_cents, remaining_value_cents, is_active, purchaser_name, purchaser_email, recipient_name, recipient_email, created_at";

/** One card by code, whatever its state (admin shows why it can't be used). */
export async function findGiftCardByCode(code: string): Promise<AdminGiftCardSummary | null> {
  const { data } = await supabase()
    .from("gift_cards")
    .select(SUMMARY_COLUMNS)
    .eq("code", normaliseGiftCardCode(code))
    .maybeSingle();
  if (!data) return null;
  const card = data as Omit<AdminGiftCardSummary, "problem">;
  return { ...card, problem: giftCardProblem(card) };
}

/**
 * A client's usable cards: active, with a balance, and the recipient is them
 * by email or by full name (cards bought for someone often carry the buyer's
 * email, e.g. Irene Till's). Oldest first, so the older card gets used first.
 */
export async function findClientGiftCards(client: { email?: string | null; firstName?: string | null; lastName?: string | null }): Promise<AdminGiftCardSummary[]> {
  const email = client.email?.trim().toLowerCase() || null;
  const fullName = [client.firstName?.trim(), client.lastName?.trim()].filter(Boolean).join(" ") || null;
  if (!email && !fullName) return [];

  // PostgREST or-filter: quote values so commas/dots in emails/names are safe.
  const q = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
  const ors = [
    email ? `recipient_email.ilike.${q(email)}` : null,
    fullName ? `recipient_name.ilike.${q(fullName)}` : null,
  ].filter(Boolean).join(",");

  const { data } = await supabase()
    .from("gift_cards")
    .select(SUMMARY_COLUMNS)
    .eq("is_active", true)
    .gt("remaining_value_cents", 0)
    .or(ors)
    .order("created_at", { ascending: true });
  return ((data ?? []) as Omit<AdminGiftCardSummary, "problem">[]).map((c) => ({ ...c, problem: null }));
}
