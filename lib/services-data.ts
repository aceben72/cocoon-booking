import { type Service, type CategoryMeta } from "@/types";

export const CATEGORY_META: CategoryMeta[] = [
  {
    id: "brow-treatments",
    label: "Brow Treatments",
    description: "Waxing, lamination, tinting and hybrid dye services to perfect your brows.",
    icon: "✦",
  },
  {
    id: "facials",
    label: "Facials",
    description: "Deeply nourishing facial treatments tailored to your skin's needs.",
    icon: "✦",
  },
  {
    id: "led-light-treatments",
    label: "LED Light Treatments",
    description: "Targeted LED therapy to rejuvenate, calm, and brighten your skin.",
    icon: "✦",
  },
  {
    id: "make-up",
    label: "Make-Up",
    description: "Professional make-up application and private make-up lessons.",
    icon: "✦",
  },
  {
    id: "treatment-plans",
    label: "Treatment Plans",
    description: "Multi-step professional treatment systems targeting specific skin concerns, tailored to your skin's needs.",
    icon: "✦",
  },
];

// Seed data — matches what will be in Supabase once schema is applied
export const SERVICES: Service[] = [
  // Brow Treatments
  { id: "brow-wax", category: "brow-treatments", name: "Brow Wax", duration_minutes: 30, padding_minutes: 30, price_cents: 2600, cash_price_cents: 2500, active: true },
  { id: "brow-hybrid-dye", category: "brow-treatments", name: "Brow Hybrid Dye", duration_minutes: 30, padding_minutes: 30, price_cents: 3100, cash_price_cents: 3000, active: true },
  { id: "brow-lamination", category: "brow-treatments", name: "Brow Lamination", duration_minutes: 35, padding_minutes: 30, price_cents: 6700, cash_price_cents: 6500, active: true },
  { id: "brow-hybrid-dye-wax", category: "brow-treatments", name: "Brow Hybrid Dye & Wax", duration_minutes: 40, padding_minutes: 30, price_cents: 4700, cash_price_cents: 4500, active: true },
  { id: "brow-lamination-dye", category: "brow-treatments", name: "Brow Lamination & Dye", duration_minutes: 45, padding_minutes: 30, price_cents: 8300, cash_price_cents: 8000, active: true },
  { id: "brow-lamination-dye-wax", category: "brow-treatments", name: "Brow Lamination, Dye & Wax", duration_minutes: 60, padding_minutes: 30, price_cents: 9800, cash_price_cents: 9500, active: true },

  // Facials
  { id: "basic-facial", category: "facials", name: "Basic Facial", duration_minutes: 45, padding_minutes: 30, price_cents: 10200, cash_price_cents: 9900, active: true },
  { id: "indulge-facial", category: "facials", name: "Indulge Facial", duration_minutes: 60, padding_minutes: 30, price_cents: 15400, cash_price_cents: 14900, active: true },
  { id: "opulence-facial", category: "facials", name: "Opulence Facial", duration_minutes: 80, padding_minutes: 30, price_cents: 20500, cash_price_cents: 19900, active: true },
  { id: "lifting-code-facial", category: "facials", name: "Lifting Code Facial", duration_minutes: 90, padding_minutes: 30, price_cents: 24700, cash_price_cents: 23900, active: true },

  // LED Light Treatments
  { id: "basic-led", category: "led-light-treatments", name: "Basic LED Treatment", duration_minutes: 35, padding_minutes: 30, price_cents: 4700, cash_price_cents: null, active: true },
  { id: "deluxe-led", category: "led-light-treatments", name: "Deluxe LED Treatment", duration_minutes: 40, padding_minutes: 30, price_cents: 6100, cash_price_cents: 5900, active: true },

  // Make-Up
  { id: "professional-makeup", category: "make-up", name: "Professional Make-Up Application", duration_minutes: 75, padding_minutes: 45, price_cents: 13900, cash_price_cents: 13500, active: true },
  // Private make-up lessons (Nov 2026): booked like a facial, $100 deposit.
  // Names must match services.name (POST /api/bookings looks the row up by
  // name) and lib/makeup-lessons.ts. Ids kept from before so links still work.
  {
    id: "makeup-class",
    category: "make-up",
    name: "Private Make-Up Lesson",
    duration_minutes: 120,
    padding_minutes: 30,
    price_cents: 27900,
    cash_price_cents: 27100,
    deposit_cents: 10000,
    description: "A relaxed two-hour, one-on-one lesson in my private Gainsborough Greens studio in Pimpama, built around your face, your skin and how you like to wear make-up.",
    active: true,
  },
  {
    id: "me-and-a-friend-makeup-lesson",
    category: "make-up",
    name: "Me & a Friend Make-Up Lesson",
    duration_minutes: 150,
    padding_minutes: 30,
    price_cents: 34900,
    cash_price_cents: 33900,
    deposit_cents: 10000,
    description: "A private two-and-a-half-hour make-up lesson for two in my Gainsborough Greens studio in Pimpama. $349 for the two of you.",
    active: true,
  },

  // Treatment Plans (client-facing)
  {
    id: "agebiotic-system",
    category: "treatment-plans",
    name: "Agebiotic System",
    duration_minutes: 75,
    padding_minutes: 30,
    price_cents: 99900,
    cash_price_cents: 97400,
    deposit_cents: 52700,
    description: "Specifically for those with mature skin, deeper wrinkles and dark spots being the main concerns.",
    active: true,
  },
  {
    id: "purity-herbal-peeling",
    category: "treatment-plans",
    name: "Purity Herbal Peeling System",
    duration_minutes: 75,
    padding_minutes: 30,
    price_cents: 99100,
    cash_price_cents: 96200,
    deposit_cents: 52700,
    description: "Specifically for those with acne skin or excess oiliness in both teenage and mature age skin.",
    active: true,
  },

  // Mother & Daughter Make-Up Class (private lesson, $100 deposit). Price is
  // per pair; extra daughters (0–2, no extra time) in lib/makeup-lessons.ts.
  {
    id: "mother-daughter-make-up-class",
    category: "mother-daughter",
    name: "Mother & Daughter Make-Up Class",
    duration_minutes: 150,
    padding_minutes: 30,
    price_cents: 34900,
    cash_price_cents: 33900,
    deposit_cents: 10000,
    description: "A private two-and-a-half-hour class for mothers and daughters aged 9 to 90 in my Gainsborough Greens studio in Pimpama. $349 per pair, extra daughters $99.",
    active: true,
  },

  // Admin-only services (never visible to clients)
  {
    id: "treatment-plan-facial",
    category: "admin-only",
    name: "Treatment Plan Facial",
    duration_minutes: 60,
    padding_minutes: 30,
    price_cents: 0,
    active: true,
    admin_only: true,
  },
];
