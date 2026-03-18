import type { supabaseServer } from "@/lib/supabase-server";

export function coreBaseUrl() {
  const raw =
    process.env.SIGMARIS_CORE_URL ||
    process.env.PERSONA_OS_LOCAL_URL ||
    process.env.PERSONA_OS_URL ||
    "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

export function localCoreBaseUrl() {
  const raw = process.env.SIGMARIS_CORE_URL_LOCAL || "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

export async function isDevCoreToggleAllowed(
  supabase: Awaited<ReturnType<typeof supabaseServer>>
): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    const email = String(data.user?.email ?? "").trim().toLowerCase();
    return email === "kaiseif4e@gmail.com";
  } catch {
    return false;
  }
}

export async function resolveCoreBaseUrl(params: {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  requestedMode: string | null;
}): Promise<string> {
  const requested = String(params.requestedMode ?? "").trim().toLowerCase();
  if (requested !== "local" && requested !== "fly") return coreBaseUrl();
  if (!(await isDevCoreToggleAllowed(params.supabase))) return coreBaseUrl();
  return requested === "local" ? localCoreBaseUrl() : coreBaseUrl();
}
