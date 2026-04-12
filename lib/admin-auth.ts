import { type NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cocoon_admin";

async function computeToken(password: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}:${secret}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns a 401 NextResponse if the request is not authenticated as admin,
 * or null if the request is valid. Use at the top of any admin API route
 * that is outside the /api/admin/* middleware matcher.
 */
export async function requireAdminAuth(request: NextRequest): Promise<NextResponse | null> {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const expected = await computeToken(
    process.env.ADMIN_PASSWORD ?? "",
    process.env.ADMIN_SECRET ?? "changeme",
  );
  if (!cookie || cookie !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
