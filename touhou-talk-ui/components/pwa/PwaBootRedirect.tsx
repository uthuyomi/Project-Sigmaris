"use client";

import { useEffect, useRef } from "react";
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

const ENTRY_PATHS = new Set<string>(["/", "/entry"]);

/**
 * When launched in standalone mode from the home screen,
 * redirect the initial entry page (`/` or `/entry`) to `/chat/session`.
 *
 * Important: only run this redirect on boot so users can still navigate back
 * to the entry page from within the app.
 */
export default function PwaBootRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  const bootPathnameRef = useRef<string | null>(null);
  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (bootPathnameRef.current == null) {
      bootPathnameRef.current = pathname;
    }

    if (didRedirectRef.current) return;
    if (!isStandalone()) return;

    const bootPathname = bootPathnameRef.current;
    if (!bootPathname || !ENTRY_PATHS.has(bootPathname)) return;

    // Only redirect while we're still on the boot entry page.
    if (pathname !== bootPathname) return;

    didRedirectRef.current = true;
    router.replace("/chat/session");
  }, [pathname, router]);

  return null;
}

