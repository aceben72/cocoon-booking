"use client";

import { useState, useEffect } from "react";
import MobileCalendar from "./MobileCalendar";

/**
 * Client wrapper that mounts MobileCalendar on screens < 768 px and the
 * normal desktop page content on larger screens.  Using JS rather than CSS
 * breakpoints ensures that fixed-position elements inside MobileCalendar
 * (FAB, bottom sheet) are never present in the DOM on desktop.
 */
export default function AdminMobileWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Start with desktop content to avoid hydration mismatch (SSR has no
  // window, so we conservatively assume desktop on the first render).
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    setMounted(true);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!mounted || !isMobile) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    );
  }

  return <MobileCalendar />;
}
