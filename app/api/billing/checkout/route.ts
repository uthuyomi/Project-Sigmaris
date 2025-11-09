// /app/api/billing/checkout/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

let stripe: any = null;
try {
  // ⚙️ Stripe SDK の動的ロード（ビルド時に undefined を避ける）
  const Stripe = require("stripe");
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  } else {
    console.warn("⚠️ Stripe key not found — mock mode enabled");
  }
} catch (e) {
  console.warn("⚠️ Stripe SDK unavailable:", e);
}

/**
 * 💳 Stripe Checkout セッション生成API
 * - Stripeキー未発行時はモックレスポンスでビルドを通す
 * - Supabaseユーザー情報を参照して顧客IDを維持
 */
export async function POST(req: Request) {
  try {
    const { plan } = await req.json();

    // ✅ Supabase認証確認
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Stripeが未設定の場合は安全にスキップ（審査待ちモード）
    if (!stripe) {
      console.log("💤 Mock Stripe Checkout triggered (審査中)");
      return NextResponse.json({
        message:
          "Stripe審査中のため、現在チェックアウトは利用できません。審査通過後に自動有効化されます。",
      });
    }

    const supabase = getSupabaseServer();

    // ✅ Stripe顧客IDの確認／未登録なら作成
    let stripeCustomerId = (user as any)?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: { userId: user.id },
      });

      await supabase
        .from("users")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);

      stripeCustomerId = customer.id;
    }

    // ✅ プラン別のStripe Price IDマッピング
    const priceMap: Record<string, string> = {
      pro: process.env.STRIPE_PRICE_PRO_ID ?? "",
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE_ID ?? "",
    };

    const selectedPrice = priceMap[plan] || priceMap["pro"];
    if (!selectedPrice) {
      throw new Error("Price ID not configured for selected plan.");
    }

    // ✅ Stripe Checkoutセッション生成
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: selectedPrice, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/cancel`,
    });

    console.log("💳 Checkout session created:", session.id);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[/api/billing/checkout] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
