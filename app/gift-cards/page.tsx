import GiftCardPurchase from "./GiftCardPurchase";

export const dynamic = "force-dynamic";

const VALID_AMOUNTS = [50, 100, 150, 200];

export default async function GiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string }>;
}) {
  const params = await searchParams;
  const amountDollars = parseInt(params.amount ?? "", 10);
  const initialAmountCents = VALID_AMOUNTS.includes(amountDollars) ? amountDollars * 100 : undefined;

  return <GiftCardPurchase initialAmountCents={initialAmountCents} />;
}
