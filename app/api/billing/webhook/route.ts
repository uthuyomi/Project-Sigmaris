// /app/api/billing/webhook/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
 * - checkout.session.completed → 支払い完了イベント
 * - customer.subscription.* → サブスク関連（将来対応予定）
 * - userId（metadata）ベースで Supabase 更新
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  // ✅ Next.js の req.text() で生データ取得（重要）
  const rawBody = await req.text();

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

  // ✅ Supabase（Service Role Keyで接続）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    switch (event.type) {
      /**
       * 💳 単発決済完了イベント
       */
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId ?? null;
        const chargeType = session.metadata?.charge_type ?? "";
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

        // 🔍 対応するユーザーを取得
        const { data: profile, error: fetchErr } = await supabase
          .from("user_profiles")
          .select("id, credit_balance")
          .eq("id", userId)
          .maybeSingle();

        if (fetchErr) {
          console.error("⚠️ DB fetch error:", fetchErr);
          break;
        }

        const currentCredits = profile?.credit_balance ?? 0;
        const newCredits = currentCredits + creditsToAdd;

        // 📅 +30日後
        const plus30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // 🧾 更新
        const { error: updateErr } = await supabase
          .from("user_profiles")
          .update({
            plan: "pro",
            trial_end: plus30d.toISOString(),
            credit_balance: newCredits,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (updateErr) {
          console.error("⚠️ Update failed:", updateErr);
        } else {
          console.log("✅ Credit balance updated:", {
            userId,
            added: creditsToAdd,
            newCredits,
          });
        }
        break;
      }

      /**
       * 🔄 サブスク（将来対応用）
       */
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        console.log(`ℹ️ Subscription event received: ${event.type}`);
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event: ${event.type}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("💥 Webhook internal error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
