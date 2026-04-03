import { createClient } from "@supabase/supabase-js";

export interface Coupon {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  applies_to: "all" | "specific_categories";
  created_at: string;
  /** Populated when applies_to = 'specific_categories' */
  categories?: string[];
}

export interface CouponValidation {
  valid: boolean;
  coupon?: Coupon;
  discountCents?: number;
  error?: string;
}

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Validates a coupon code server-side.
 * @param code      The coupon code entered by the user.
 * @param category  The service category slug (used for category-restricted coupons).
 * @param amountCents  The pre-discount amount so we can compute the discount.
 */
export async function validateCoupon(
  code: string,
  category: string,
  amountCents: number,
): Promise<CouponValidation> {
  const normalised = code.trim().toUpperCase();

  const { data, error } = await supabase()
    .from("coupons")
    .select("*, coupon_category_restrictions(category)")
    .eq("code", normalised)
    .single();

  if (error || !data) {
    return { valid: false, error: "Discount code not found." };
  }

  const coupon = data as Coupon & {
    coupon_category_restrictions: { category: string }[];
  };

  if (!coupon.is_active) {
    return { valid: false, error: "This discount code is no longer active." };
  }

  // Uses limit
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return { valid: false, error: "This discount code has reached its maximum uses." };
  }

  // Date range
  const today = new Date().toISOString().slice(0, 10);
  if (coupon.valid_from && today < coupon.valid_from) {
    return { valid: false, error: "This discount code is not yet valid." };
  }
  if (coupon.valid_until && today > coupon.valid_until) {
    return { valid: false, error: "This discount code has expired." };
  }

  // Category restriction
  if (coupon.applies_to === "specific_categories") {
    const allowedCategories = coupon.coupon_category_restrictions.map((r) => r.category);
    if (!allowedCategories.includes(category)) {
      return { valid: false, error: "This discount code does not apply to this service." };
    }
  }

  const discountCents = calculateDiscount(coupon, amountCents);

  return {
    valid: true,
    coupon: {
      ...coupon,
      categories: coupon.coupon_category_restrictions?.map((r) => r.category),
    },
    discountCents,
  };
}

/**
 * Calculates the discount in cents for a given coupon and amount.
 * For percentage coupons, rounds down to the nearest cent.
 * The discount is capped at the amount (no negative prices).
 */
export function calculateDiscount(
  coupon: Pick<Coupon, "type" | "value">,
  amountCents: number,
): number {
  let discount: number;

  if (coupon.type === "percentage") {
    discount = Math.floor((amountCents * coupon.value) / 100);
  } else {
    // fixed — value is already in cents
    discount = Math.round(coupon.value);
  }

  return Math.min(discount, amountCents);
}
