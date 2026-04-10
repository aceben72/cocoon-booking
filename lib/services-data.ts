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
    description: "Professional make-up application and personalised make-up coaching.",
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
  { id: "brow-wax", category: "brow-treatments", name: "Brow Wax", duration_minutes: 30, padding_minutes: 30, price_cents: 2500, active: true },
  { id: "brow-hybrid-dye", category: "brow-treatments", name: "Brow Hybrid Dye", duration_minutes: 30, padding_minutes: 30, price_cents: 3000, active: true },
  { id: "brow-lamination", category: "brow-treatments", name: "Brow Lamination", duration_minutes: 35, padding_minutes: 30, price_cents: 6500, active: true },
  { id: "brow-hybrid-dye-wax", category: "brow-treatments", name: "Brow Hybrid Dye & Wax", duration_minutes: 40, padding_minutes: 30, price_cents: 4500, active: true },
  { id: "brow-lamination-dye", category: "brow-treatments", name: "Brow Lamination & Dye", duration_minutes: 45, padding_minutes: 30, price_cents: 8000, active: true },
  { id: "brow-lamination-dye-wax", category: "brow-treatments", name: "Brow Lamination, Dye & Wax", duration_minutes: 60, padding_minutes: 30, price_cents: 9500, active: true },

  // Facials
  { id: "basic-facial", category: "facials", name: "Basic Facial", duration_minutes: 45, padding_minutes: 30, price_cents: 9900, active: true },
  { id: "indulge-facial", category: "facials", name: "Indulge Facial", duration_minutes: 60, padding_minutes: 30, price_cents: 14900, active: true },
  { id: "opulence-facial", category: "facials", name: "Opulence Facial", duration_minutes: 80, padding_minutes: 30, price_cents: 19900, active: true },

  // LED Light Treatments
  { id: "basic-led", category: "led-light-treatments", name: "Basic LED Treatment", duration_minutes: 35, padding_minutes: 30, price_cents: 4500, active: true },
  { id: "deluxe-led", category: "led-light-treatments", name: "Deluxe LED Treatment", duration_minutes: 40, padding_minutes: 30, price_cents: 5900, active: true },

  // Make-Up
  { id: "professional-makeup", category: "make-up", name: "Professional Make-Up Application", duration_minutes: 60, padding_minutes: 30, price_cents: 13000, active: true },
  { id: "makeup-class", category: "make-up", name: "Personal Make Up Class", duration_minutes: 90, padding_minutes: 30, price_cents: 15900, active: true },

  // Treatment Plans (client-facing)
  {
    id: "agebiotic-system",
    category: "treatment-plans",
    name: "Agebiotic System",
    duration_minutes: 75,
    padding_minutes: 30,
    price_cents: 97400,
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
    price_cents: 89400,
    deposit_cents: 52700,
    description: "Specifically for those with acne skin or excess oiliness in both teenage and mature age skin.",
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
