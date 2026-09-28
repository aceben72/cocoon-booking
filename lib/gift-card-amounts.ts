// Shared by the gift card purchase UI (client) and the purchase API (server).
// Kept separate from lib/gift-cards.ts so the client bundle doesn't pull in
// the Supabase server helpers.

export const GIFT_CARD_PRESET_CENTS = [5000, 10000, 15000, 20000]; // $50, $100, $150, $200

export const GIFT_CARD_MIN_CENTS = 2500; // $25
export const GIFT_CARD_MAX_CENTS = 50000; // $500

/** Whole-dollar amount within the allowed range. The server is the source of truth. */
export function isValidGiftCardAmountCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value % 100 === 0 &&
    value >= GIFT_CARD_MIN_CENTS &&
    value <= GIFT_CARD_MAX_CENTS
  );
}

/** Parses a whole-dollar string ("75") into cents, or null if it isn't a valid amount. */
export function parseGiftCardDollars(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const cents = Number(trimmed) * 100;
  return isValidGiftCardAmountCents(cents) ? cents : null;
}

export function formatGiftCardDollars(cents: number) {
  return `$${cents / 100}`;
}
