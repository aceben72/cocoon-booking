import { NextRequest, NextResponse } from "next/server";
import { validateCoupon } from "@/lib/coupons";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { code, category, amountCents } = body as {
    code?: string;
    category?: string;
    amountCents?: number;
  };

  if (!code || !code.trim()) {
    return NextResponse.json({ valid: false, error: "Code is required." }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ valid: false, error: "Service category is required." }, { status: 400 });
  }
  if (typeof amountCents !== "number" || amountCents <= 0) {
    return NextResponse.json({ valid: false, error: "Amount is required." }, { status: 400 });
  }

  const result = await validateCoupon(code, category, amountCents);
  return NextResponse.json(result);
}
