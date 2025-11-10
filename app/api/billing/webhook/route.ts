// /app/api/billing/webhook/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ✅ Stripe SDK 初期化（本番・開発両対応）
let stripe: any = null;
try {
  const Stripe = require("stripe");
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  } else {
    console.warn("⚠️ Stripe key not found — mock mode enabled (webhook)");
  }
} catch (e) {
  console.warn("⚠️ Stripe SDK unavailable (webhook):", e);
}

/**
 * 📦 Stripe Webhook ハンドラー
 * -------------------------------------
 * checkout.session.completed → 支払い完了イベント
 * metadata.userId を使用して Supabase の user_profiles を更新
 * -------------------------------------
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  // ✅ Stripeが署名検証に必要とする生データを取得
  const rawBody = await req.text();

  // Stripeキー未設定時のモック処理
  if (!stripe) {
    console.log("💤 Mock Stripe Webhook triggered (審査中モード)");
    return NextResponse.json({ ok: true, mock: true });
  }

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("❌ Invalid Stripe signature:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ✅ Supabaseクライアント（Service Role Keyで認証）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    switch (event.type) {
      /**
       * 💳 単発決済完了（プリペイド式チャージ）
       */
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId ?? null;
        const chargeType = session.metadata?.charge_type ?? "";

        // 1000円＝100クレジット、3000円＝400クレジット
        const creditsToAdd =
          chargeType === "3000yen" ? 400 : chargeType === "1000yen" ? 100 : 0;

        if (!userId) {
          console.warn("⚠️ Missing userId in session metadata");
          break;
        }

        console.log(`📬 Webhook received for userId=${userId}`, {
          chargeType,
          creditsToAdd,
        });

        // 🧾 現在のクレジットを取得
        const { data: profile, error: fetchErr } = await supabase
          .from("user_profiles")
          .select("credit_balance")
          .eq("id", userId)
          .single();

        if (fetchErr) {
          console.error("⚠️ Failed to fetch user:", fetchErr);
          break;
        }

        const currentCredits = profile?.credit_balance ?? 0;
        const newCredits = currentCredits + creditsToAdd;

        // 📅 有効期限 +30日
        const plus30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // 💰 クレジット加算・プラン更新
        const { error: updateErr } = await supabase
          .from("user_profiles")
          .update({
            plan: "pro",
            credit_balance: newCredits,
            trial_end: plus30d.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (updateErr) {
          console.error("⚠️ Failed to update user profile:", updateErr);
        } else {
          console.log("✅ Credit balance updated successfully", {
            userId,
            added: creditsToAdd,
            total: newCredits,
          });
        }

        break;
      }

      /**
       * 🔄 サブスク系イベント（将来対応用）
       */
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        console.log(`ℹ️ Subscription event received: ${event.type}`);
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    // Stripeへの正常応答
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("💥 Webhook internal error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
