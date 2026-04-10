// ─── Database Row Types ────────────────────────────────────────────────────

export type ServiceCategory =
  | "brow-treatments"
  | "facials"
  | "led-light-treatments"
  | "make-up"
  | "treatment-plans"
  | "admin-only";

export interface Service {
  id: string;
  category: ServiceCategory;
  name: string;
  duration_minutes: number;
  padding_minutes: number;
  price_cents: number;
  deposit_cents?: number;     // if set, overrides the default $50 deposit in the client booking flow
  description?: string;       // shown on service card and booking summary
  active: boolean;
  admin_only?: boolean;       // if true, never shown in the client-facing booking flow
}

export interface AvailabilityRule {
  id: string;
  day_of_week: number; // 0=Sun, 1=Mon, ..., 6=Sat
  open_time: string;   // "HH:MM"
  close_time: string;  // "HH:MM"
  is_closed: boolean;
}

export interface BlockedPeriod {
  id: string;
  start_datetime: string; // ISO
  end_datetime: string;   // ISO
  reason: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  is_new_client: boolean;
  notes: string | null;
  created_at: string;
}

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "pending_payment";

export interface Appointment {
  id: string;
  service_id: string;
  client_id: string;
  start_datetime: string; // ISO UTC
  end_datetime: string;   // ISO UTC
  status: AppointmentStatus;
  square_payment_id: string | null;
  amount_cents: number;
  created_at: string;
  updated_at: string;
}

// ─── UI / Booking Flow Types ───────────────────────────────────────────────

export interface BookingState {
  service: Service | null;
  date: string | null;      // "YYYY-MM-DD" AEST
  timeSlot: string | null;  // "HH:MM" AEST
  clientDetails: ClientDetailsForm | null;
}

export interface ClientDetailsForm {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  notes: string;
  is_new_client: boolean;
}

export interface TimeSlot {
  time: string;       // "HH:MM" display in AEST
  available: boolean;
}

export interface CategoryMeta {
  id: ServiceCategory;
  label: string;
  description: string;
  icon: string;
}

// ─── Class Sessions & Bookings ─────────────────────────────────────────────

export type ClassType = "masterclass" | "mother_daughter";

export interface ClassSession {
  id: string;
  class_type: ClassType;
  title: string;
  start_datetime: string; // ISO UTC
  duration_minutes: number;
  capacity: number;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface ClassSessionWithAvailability extends ClassSession {
  spots_remaining: number;
}

export interface ClassBooking {
  id: string;
  session_id: string;
  client_id: string;
  status: "confirmed" | "cancelled";
  square_payment_id: string | null;
  amount_cents: number;
  created_at: string;
  updated_at: string;
}
