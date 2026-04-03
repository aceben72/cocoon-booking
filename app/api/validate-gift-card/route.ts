import { NextRequest, NextResponse } from "next/server";
import { validateGiftCard } from "@/lib/gift-cards";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { code } = body as { code?: string };

  if (!code || !code.trim()) {
    return NextResponse.json({ valid: false, error: "Code is required." }, { status: 400 });
  }

  const result = await validateGiftCard(code);
  return NextResponse.json(result);
}
