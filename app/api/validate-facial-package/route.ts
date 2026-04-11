import { NextRequest, NextResponse } from "next/server";
import { validateFacialPackage } from "@/lib/facial-packages";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { code, serviceSlug } = body as { code?: string; serviceSlug?: string };

  if (!code?.trim()) {
    return NextResponse.json({ valid: false, error: "Code is required." }, { status: 400 });
  }
  if (!serviceSlug?.trim()) {
    return NextResponse.json({ valid: false, error: "Service not specified." }, { status: 400 });
  }

  const result = await validateFacialPackage(code.trim(), serviceSlug.trim());

  if (!result.valid) {
    return NextResponse.json({ valid: false, error: result.error });
  }

  const pkg = result.package!;

  return NextResponse.json({
    valid: true,
    package: {
      code: pkg.code,
      package_type: pkg.package_type,
      remaining_uses: pkg.remaining_uses,
      total_uses: pkg.total_uses,
      expires_at: pkg.expires_at,
    },
  });
}
