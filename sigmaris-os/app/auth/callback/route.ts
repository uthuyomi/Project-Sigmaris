import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  // OAuth 側が error を返した場合は、そのままログイン画面へ（原因を見える化）
  if (oauthError) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", oauthError);
    if (oauthErrorDescription) dest.searchParams.set("desc", oauthErrorDescription);
    return NextResponse.redirect(dest);
  }

  // code が無ければ /auth/login へ（= OAuth が完了していない/redirect_toが許可されていない等）
  if (!code) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", "missing_code");
    return NextResponse.redirect(dest);
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", "exchange_failed");
    if (error?.message) dest.searchParams.set("desc", error.message);
    return NextResponse.redirect(dest);
  }

  return NextResponse.redirect(new URL("/", url.origin));
}

