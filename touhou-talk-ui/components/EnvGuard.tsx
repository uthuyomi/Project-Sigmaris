"use client";

import { useEffect, useMemo, useRef } from "react";

type PublicConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  desktopEnvPath?: string;
  desktopUserDataDir?: string;
};

function readPublicConfig(): PublicConfig {
  if (typeof window === "undefined") return {};
  const g = window as any;
  const cfg = g.__TOUHOU_PUBLIC;
  if (!cfg || typeof cfg !== "object") return {};
  return cfg as PublicConfig;
}

export function EnvGuard({ children }: { children: React.ReactNode }) {
  const cfg = useMemo(() => readPublicConfig(), []);
  const warnedRef = useRef(false);

  const urlOk = typeof cfg.supabaseUrl === "string" && cfg.supabaseUrl.trim() !== "";
  const anonOk =
    typeof cfg.supabaseAnonKey === "string" && cfg.supabaseAnonKey.trim() !== "";
  const ok = urlOk && anonOk;

  useEffect(() => {
    if (ok) return;
    if (warnedRef.current) return;
    warnedRef.current = true;
    // Intentionally do not block rendering. Some environments populate runtime config later.
    console.warn("[EnvGuard] supabase public config missing", {
      supabaseUrl: urlOk ? "OK" : "MISSING",
      supabaseAnonKey: anonOk ? "OK" : "MISSING",
      desktopEnvPath: cfg.desktopEnvPath,
      desktopUserDataDir: cfg.desktopUserDataDir,
    });
  }, [ok, urlOk, anonOk, cfg.desktopEnvPath, cfg.desktopUserDataDir]);

  return <>{children}</>;
}
