"use client";

const DEFAULT_STEPS = [
  { num: 1, label: "Service" },
  { num: 2, label: "Date" },
  { num: 3, label: "Time" },
  { num: 4, label: "Details" },
  { num: 5, label: "Payment" },
];

interface Props {
  currentStep: number;
  steps?: { num: number; label: string }[];
}

export default function BookingProgress({ currentStep, steps }: Props) {
  const STEPS = steps ?? DEFAULT_STEPS;
  return (
    <div className="bg-white border-b border-[#f0ebe4]">
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const isCompleted = step.num < currentStep;
            const isCurrent = step.num === currentStep;

            return (
              <div key={step.num} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={[
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                      isCompleted
                        ? "bg-[#044e77] text-white"
                        : isCurrent
                          ? "bg-[#fbb040] text-white"
                          : "bg-[#f0ebe4] text-[#9a8f87]",
                    ].join(" ")}
                  >
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      step.num
                    )}
                  </div>
                  <span
                    className={[
                      "text-xs mt-1 font-light",
                      isCurrent ? "text-[#044e77] font-medium" : "text-[#9a8f87]",
                    ].join(" ")}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={[
                      "flex-1 h-px mx-2 mt-[-14px]",
                      isCompleted ? "bg-[#044e77]" : "bg-[#e8e0d8]",
                    ].join(" ")}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
