import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const COOKIE_NAME = "cocoon_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function computeToken(password: string, secret: string): string {
  return createHash("sha256")
    .update(`${password}:${secret}`)
    .digest("hex");
}

export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({ password: "" }));

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = computeToken(
    process.env.ADMIN_PASSWORD!,
    process.env.ADMIN_SECRET ?? "changeme",
  );

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return response;
}
