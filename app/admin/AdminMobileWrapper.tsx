"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import MobileCalendar from "./MobileCalendar";

/**
 * Client wrapper that mounts MobileCalendar on screens < 768 px and the
 * normal desktop page content on larger screens.  Using JS rather than CSS
 * breakpoints ensures that fixed-position elements inside MobileCalendar
 * (FAB, bottom sheet) are never present in the DOM on desktop.
 *
 * The login page always renders its own children — otherwise a signed-out
 * phone would get the calendar (whose fetches 401) instead of the form.
 */
export default function AdminMobileWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLogin = pathname.startsWith("/admin/login");

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

  // Session expired mid-use: any admin API call answering 401 sends the
  // browser to the login form instead of leaving the page showing errors.
  useEffect(() => {
    if (isLogin) return;
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const res = await originalFetch(input, init);
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.origin).pathname;
      if (
        res.status === 401 &&
        path.startsWith("/api/admin") &&
        !path.startsWith("/api/admin/login") &&
        !path.startsWith("/api/admin/logout")
      ) {
        const next = window.innerWidth < 768 ? "/admin" : window.location.pathname;
        window.location.href = `/admin/login?next=${encodeURIComponent(next)}`;
      }
      return res;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [isLogin]);

  if (isLogin || !mounted || !isMobile) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    );
  }

  return <MobileCalendar />;
}
