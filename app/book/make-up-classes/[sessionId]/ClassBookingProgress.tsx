"use client";

import BookingProgress from "@/components/BookingProgress";

const CLASS_STEPS = [
  { num: 1, label: "Session" },
  { num: 2, label: "Details" },
  { num: 3, label: "Payment" },
];

interface Props {
  /** 2 = Details (current), 3 = Payment (current) */
  currentStep: number;
}

export default function ClassBookingProgress({ currentStep }: Props) {
  return <BookingProgress currentStep={currentStep} steps={CLASS_STEPS} />;
}
