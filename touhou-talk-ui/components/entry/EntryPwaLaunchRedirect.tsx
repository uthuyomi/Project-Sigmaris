"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari (added to home screen)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav: any = window.navigator;
  if (typeof nav?.standalone === "boolean") return nav.standalone;
  // others
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

/**
 * When the app is launched from the home screen (PWA/standalone),
 * always start from `/chat/session` so auth gating behaves consistently.
 */
export default function EntryPwaLaunchRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isStandalone()) return;
    // Only redirect when landing on entry-style pages.
    if (pathname !== "/" && pathname !== "/entry") return;
    router.replace("/chat/session");
  }, [pathname, router]);

  return null;
}

