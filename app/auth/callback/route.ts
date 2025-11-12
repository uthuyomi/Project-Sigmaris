import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // ❗ セーフガード：code がない場合は即リダイレクト
  if (!code) {
    console.warn("⚠️ OAuth callback without code parameter");
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const cookieStore = (await cookies()) as unknown as ReadonlyRequestCookies;

  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore,
  });

  // 🧠 Supabase OAuth → セッション交換
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    console.error("❌ Supabase session exchange failed:", error);
    return NextResponse.redirect(
      new URL("/auth/login?error=exchange_failed", request.url)
    );
  }

  const user = data.session.user;
  const email = user?.email ?? "unknown";

  // 🧩 Stripe連携（存在チェック＋自動生成）
  try {
    const db = getSupabaseServer();
    const { data: existing } = await db
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing?.stripe_customer_id) {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.create({
        email,
        metadata: { userId: user.id },
      });

      await db
        .from("users")
        .update({
          stripe_customer_id: customer.id,
          plan: "free",
          trial_end: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(), // 7日トライアル
        })
        .eq("id", user.id);

      console.log("✅ Stripe customer created:", customer.id);
    } else {
      console.log(
        "ℹ️ Existing Stripe customer found:",
        existing.stripe_customer_id
      );
    }
  } catch (e) {
    console.error("⚠️ Stripe auto-link error:", e);
  }

  // 🎯 認証完了 → ダッシュボードへ遷移
  return NextResponse.redirect(new URL("/", request.url));
}
