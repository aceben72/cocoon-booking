import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("cocoon_admin", "", { maxAge: 0, path: "/" });
  return response;
}
