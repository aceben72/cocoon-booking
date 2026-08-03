import { NextRequest, NextResponse } from "next/server";
import { validateCouponForClass } from "@/lib/coupons";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { code, amountCents } = body as {
    code?: string;
    amountCents?: number;
  };

  if (!code || !code.trim()) {
    return NextResponse.json({ valid: false, error: "Code is required." }, { status: 400 });
  }
  if (typeof amountCents !== "number" || amountCents <= 0) {
    return NextResponse.json({ valid: false, error: "Amount is required." }, { status: 400 });
  }

  const result = await validateCouponForClass(code, amountCents);
  return NextResponse.json(result);
}
