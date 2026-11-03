"use client";

import type { LessonDetailsInput } from "@/lib/makeup-lessons";
import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  EXTRA_DAUGHTER_PRICE_CENTS,
  LEARN_QUESTION,
  MAX_EXTRA_DAUGHTERS,
  allowsExtraDaughters,
  lessonAttendeeSlots,
  FRIEND_LESSON_NAME,
} from "@/lib/makeup-lessons";
import { formatPrice } from "@/lib/utils";

interface Props {
  serviceName: string;
  value: LessonDetailsInput;
  onChange: (next: LessonDetailsInput) => void;
  errors: { friendEmail?: string; friendMobile?: string };
  inputClass: (hasError: boolean) => string;
}

/** Extra fields on the details step for the private make-up lessons. All optional. */
export default function LessonFields({ serviceName, value, onChange, errors, inputClass }: Props) {
  const extras = value.extraDaughters ?? 0;
  const slots = lessonAttendeeSlots(serviceName, extras);
  const levels = value.levels ?? {};
  const friend = value.friend ?? {};

  const setLevel = (key: string, level: string) => {
    const next = { ...levels };
    if (level) next[key] = level;
    else delete next[key];
    onChange({ ...value, levels: next });
  };

  const setExtras = (n: number) => {
    // Drop answers for extra daughters no longer on the booking.
    const next = Object.fromEntries(
      Object.entries(levels).filter(([k]) => !k.startsWith("extra_daughter:") || Number(k.split(":")[1]) <= n),
    );
    onChange({ ...value, extraDaughters: n, levels: next });
  };

  const setFriend = (key: "name" | "email" | "mobile", v: string) =>
    onChange({ ...value, friend: { ...friend, [key]: v } });

  return (
    <div className="flex flex-col gap-5 pt-5 border-t border-[#f0ebe4]">
      {allowsExtraDaughters(serviceName) && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="extra-daughters" className="text-sm font-medium text-[#3a3330]">
            Extra daughters
          </label>
          <select
            id="extra-daughters"
            value={extras}
            onChange={(e) => setExtras(Number(e.target.value))}
            className={inputClass(false)}
          >
            {Array.from({ length: MAX_EXTRA_DAUGHTERS + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? "None — just mum and one daughter" : `${n} extra daughter${n > 1 ? "s" : ""} (+${formatPrice(n * EXTRA_DAUGHTER_PRICE_CENTS)})`}
              </option>
            ))}
          </select>
          <p className="text-xs text-[#b0a499] font-light">
            The price covers one mum and one daughter. Extra daughters are {formatPrice(EXTRA_DAUGHTER_PRICE_CENTS)} each.
          </p>
        </div>
      )}

      {serviceName === FRIEND_LESSON_NAME && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-[#3a3330]">
            Your friend&apos;s details <span className="text-xs text-[#b0a499] font-light">(optional)</span>
          </p>
          <input
            type="text"
            value={friend.name ?? ""}
            onChange={(e) => setFriend("name", e.target.value)}
            placeholder="Friend's name"
            className={inputClass(false)}
            autoComplete="off"
          />
          <div className="flex flex-col gap-1">
            <input
              type="email"
              value={friend.email ?? ""}
              onChange={(e) => setFriend("email", e.target.value)}
              placeholder="Friend's email"
              className={inputClass(!!errors.friendEmail)}
              autoComplete="off"
            />
            {errors.friendEmail && <p className="text-xs text-red-600">{errors.friendEmail}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <input
              type="tel"
              value={friend.mobile ?? ""}
              onChange={(e) => setFriend("mobile", e.target.value)}
              placeholder="Friend's mobile"
              className={inputClass(!!errors.friendMobile)}
              autoComplete="off"
            />
            {errors.friendMobile && <p className="text-xs text-red-600">{errors.friendMobile}</p>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-[#3a3330]">
          {LEARN_QUESTION} <span className="text-xs text-[#b0a499] font-light">(optional)</span>
        </p>
        {slots.map((slot) => {
          const key = `${slot.role}:${slot.position}`;
          return (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={`level-${key}`} className="text-xs text-[#7a6f68] font-light">{slot.label}</label>
              <select
                id={`level-${key}`}
                value={levels[key] ?? ""}
                onChange={(e) => setLevel(key, e.target.value)}
                className={inputClass(false)}
              >
                <option value="">Choose one…</option>
                {EXPERIENCE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{EXPERIENCE_LEVEL_LABELS[lvl]}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
