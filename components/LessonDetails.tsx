import {
  EXPERIENCE_LEVEL_LABELS,
  attendeeLabel,
  isExperienceLevel,
  isMakeupLesson,
  LEARN_QUESTION,
} from "@/lib/makeup-lessons";

export interface LessonAttendee {
  role: string;
  position: number;
  experience_level: string | null;
  name: string | null;
  email: string | null;
  mobile: string | null;
}

const ROLE_ORDER = ["client", "mum", "friend", "daughter", "extra_daughter"];

/**
 * Admin read-out for a private make-up lesson: extra daughters, each person's
 * "What would you like to learn?" answer and the friend's details. Renders
 * nothing for any other service. Used by the appointments table and the
 * phone calendar sheet.
 */
export function LessonDetails({
  serviceName,
  extraDaughters,
  attendees,
}: {
  serviceName: string | null | undefined;
  extraDaughters: number | null | undefined;
  attendees: LessonAttendee[] | null | undefined;
}) {
  if (!isMakeupLesson(serviceName)) return null;
  const people = [...(attendees ?? [])].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.position - b.position,
  );
  const friend = people.find((p) => p.role === "friend" && (p.name || p.email || p.mobile));

  return (
    <div className="text-sm space-y-1.5">
      {(extraDaughters ?? 0) > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-[#9a8f87]">Extra daughters</span>
          <span className="text-[#1a1a1a] font-medium">{extraDaughters}</span>
        </div>
      )}
      {people.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">{LEARN_QUESTION}</div>
          <ul className="space-y-0.5">
            {people.map((p) => (
              <li key={`${p.role}:${p.position}`} className="flex justify-between gap-4">
                <span className="text-[#9a8f87]">{attendeeLabel(p.role, p.position)}</span>
                <span className="text-[#1a1a1a] text-right">
                  {isExperienceLevel(p.experience_level) ? EXPERIENCE_LEVEL_LABELS[p.experience_level] : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {friend && (
        <div>
          <div className="text-xs uppercase tracking-wider text-[#7a6f68] mb-0.5">Friend&apos;s details</div>
          <div className="text-[#1a1a1a] break-words">
            {[friend.name, friend.email, friend.mobile].filter(Boolean).join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}
