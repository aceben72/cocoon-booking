import { createClient } from "@supabase/supabase-js";

export interface FacialPackage {
  id: string;
  code: string;
  package_type: "indulge" | "opulence";
  service_id: string;
  purchaser_name: string;
  purchaser_email: string;
  recipient_name: string;
  recipient_email: string;
  personal_message: string | null;
  total_uses: number;
  remaining_uses: number;
  square_payment_id: string | null;
  amount_paid_cents: number;
  expires_at: string;
  created_at: string;
}

export interface FacialPackageValidation {
  valid: boolean;
  package?: FacialPackage;
  error?: string;
}

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit I, O, 0, 1 for clarity

export function generatePackageCode(): string {
  const seg = () =>
    Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
  return `FPKG-${seg()}-${seg()}-${seg()}`;
}

/**
 * Maps a service slug (from services-data.ts) to a package_type.
 * Returns null if the service does not have a corresponding package.
 */
export function serviceSlugToPackageType(slug: string): "indulge" | "opulence" | null {
  if (slug === "indulge-facial") return "indulge";
  if (slug === "opulence-facial") return "opulence";
  return null;
}

export const PACKAGE_META = {
  indulge: {
    label: "Indulge Facial Package",
    serviceSlug: "indulge-facial",
    serviceName: "Indulge Facial",
    priceCents: 49900,
    uses: 4,
    bookingUrl:
      "https://book.cocoonskinandbeauty.com.au/book?category=facials&service=indulge-facial",
  },
  opulence: {
    label: "Opulence Facial Package",
    serviceSlug: "opulence-facial",
    serviceName: "Opulence Facial",
    priceCents: 63500,
    uses: 4,
    bookingUrl:
      "https://book.cocoonskinandbeauty.com.au/book?category=facials&service=opulence-facial",
  },
} as const;

/**
 * Validates a facial package code server-side.
 * Pass the service slug being booked to enforce service locking.
 */
export async function validateFacialPackage(
  code: string,
  serviceSlug: string,
): Promise<FacialPackageValidation> {
  const normalised = code.trim().toUpperCase();

  const { data, error } = await supabase()
    .from("facial_packages")
    .select("*")
    .eq("code", normalised)
    .single();

  if (error || !data) {
    return { valid: false, error: "Facial package code not found." };
  }

  const pkg = data as FacialPackage;

  if (pkg.remaining_uses <= 0) {
    return { valid: false, error: "This package has no remaining appointments." };
  }

  if (new Date(pkg.expires_at) < new Date()) {
    return { valid: false, error: "This package has expired." };
  }

  const expectedType = serviceSlugToPackageType(serviceSlug);
  if (!expectedType) {
    return {
      valid: false,
      error: "Facial packages can only be applied to Indulge or Opulence Facials.",
    };
  }

  if (pkg.package_type !== expectedType) {
    const packageFor =
      pkg.package_type === "indulge" ? "Indulge Facials" : "Opulence Facials";
    return {
      valid: false,
      error: `This package is for ${packageFor} only. Please select the correct facial to redeem.`,
    };
  }

  return { valid: true, package: pkg };
}
