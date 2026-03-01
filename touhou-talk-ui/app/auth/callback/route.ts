import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequestOrigin(request: Request): string {
  const protoRaw = request.headers.get("x-forwarded-proto") || "";
  const hostRaw =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";

  const proto = protoRaw.split(",")[0]?.trim();
  const host = hostRaw.split(",")[0]?.trim();

  if (proto && host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

function safeNextPath(raw: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) return "";
  if (s.startsWith("//")) return "";
  if (s.includes("://")) return "";
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request);

  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription =
    url.searchParams.get("error_description") || url.searchParams.get("error_code");

  const safeNext = safeNextPath(nextParam);

  if (oauthError) {
    const dest = new URL("/auth/login", origin);
    dest.searchParams.set("error", oauthError);
    if (oauthErrorDescription) dest.searchParams.set("desc", oauthErrorDescription);
    return NextResponse.redirect(dest);
  }

  if (!code) {
    const dest = new URL("/auth/login", origin);
    dest.searchParams.set("error", "missing_code");
    return NextResponse.redirect(dest);
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    const dest = new URL("/auth/login", origin);
    dest.searchParams.set("error", "exchange_failed");
    if (error?.message) dest.searchParams.set("desc", error.message);
    return NextResponse.redirect(dest);
  }

  // next が無ければ /chat/session へ。
  // ここが入口（PWA起動など）になりやすく、未ログイン時は /chat/session 側でログインへ誘導する。
  return NextResponse.redirect(new URL(safeNext || "/chat/session", origin));
}
