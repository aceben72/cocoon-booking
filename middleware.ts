import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cocoon_admin";

async function computeToken(password: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}:${secret}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Guard /admin pages and /api/admin routes; leave login and logout open
  // (logout must work with an expired cookie so it can clear it)
  const isAdminApi = pathname.startsWith("/api/admin");
  if (
    (pathname.startsWith("/admin") || isAdminApi) &&
    pathname !== "/admin/login" &&
    !pathname.startsWith("/api/admin/login") &&
    !pathname.startsWith("/api/admin/logout")
  ) {
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    const expected = await computeToken(
      process.env.ADMIN_PASSWORD ?? "",
      process.env.ADMIN_SECRET ?? "changeme",
    );

    if (cookie !== expected) {
      if (isAdminApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
