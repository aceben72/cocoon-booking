import GiftCardPurchase from "./GiftCardPurchase";
import { GIFT_CARD_PRESET_CENTS, parseGiftCardDollars } from "@/lib/gift-card-amounts";

export const dynamic = "force-dynamic";

export default async function GiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string }>;
}) {
  const params = await searchParams;
  const amountParam = (params.amount ?? "").trim().toLowerCase();

  // ?amount=custom → custom tile selected, input empty and focused
  if (amountParam === "custom") {
    return <GiftCardPurchase initialCustom />;
  }

  // ?amount=75 → preset tile if it matches one, otherwise custom tile prefilled
  const initialAmountCents = parseGiftCardDollars(amountParam) ?? undefined;
  const initialCustom =
    initialAmountCents !== undefined && !GIFT_CARD_PRESET_CENTS.includes(initialAmountCents);

  return <GiftCardPurchase initialAmountCents={initialAmountCents} initialCustom={initialCustom} />;
}
