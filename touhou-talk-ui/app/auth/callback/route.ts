import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription =
    url.searchParams.get("error_description") || url.searchParams.get("error_code");

  const safeNext = (() => {
    const s = String(nextParam ?? "").trim();
    if (!s) return "";
    if (!s.startsWith("/")) return "";
    if (s.startsWith("//")) return "";
    if (s.includes("://")) return "";
    return s.length > 2048 ? s.slice(0, 2048) : s;
  })();

  if (oauthError) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", oauthError);
    if (oauthErrorDescription) dest.searchParams.set("desc", oauthErrorDescription);
    return NextResponse.redirect(dest);
  }

  if (!code) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", "missing_code");
    return NextResponse.redirect(dest);
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", "exchange_failed");
    if (error?.message) dest.searchParams.set("desc", error.message);
    return NextResponse.redirect(dest);
  }

  // Mapページは導線から外す。nextが無い場合は /entry に戻してキャラ選択へ。
  return NextResponse.redirect(new URL(safeNext || "/entry", url.origin));
}
