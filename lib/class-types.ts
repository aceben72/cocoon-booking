import type { ClassType } from "@/types";

// Single source of truth for the group class_sessions system (masterclass /
// advanced_class / mother_daughter) — label, price, and duration used across
// both the booking flow and the admin classes UI.
//
// Retired Nov 2026: no new group sessions are created (POST /api/admin/classes
// refuses, the admin form is gone). The types stay so past sessions and any
// session already scheduled keep displaying, taking bookings and completing.
// Make-up lessons are now private services (lib/makeup-lessons.ts).
export const GROUP_CLASSES_RETIRED = true;
export const CLASS_TYPE_CONFIG: Record<ClassType, {
  label: string;
  priceCents: number;
  durationMinutes: number;
  durationLabel: string;
}> = {
  masterclass:     { label: "Everyday Essentials Makeup Class", priceCents: 7900,  durationMinutes: 120, durationLabel: "2 hours" },
  advanced_class:  { label: "Advanced Techniques Makeup Class",  priceCents: 13500, durationMinutes: 150, durationLabel: "2.5 hours" },
  mother_daughter: { label: "Mother Daughter Make-Up Class",     priceCents: 8900,  durationMinutes: 180, durationLabel: "3 hours" },
};

export const CLASS_TYPE_LABELS: Record<ClassType, string> = Object.fromEntries(
  (Object.entries(CLASS_TYPE_CONFIG) as [ClassType, typeof CLASS_TYPE_CONFIG[ClassType]][])
    .map(([type, config]) => [type, config.label]),
) as Record<ClassType, string>;
