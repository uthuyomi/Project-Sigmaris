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
 * 📦 Stripe Webhook ハンドラー（auth_user_id対応最終版）
 * - checkout.session.completed → 支払い完了
 * - metadata.userId = Supabase Auth の UUID
 * - user_profiles.auth_user_id をキーに更新
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

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

  // ✅ Supabase（Service Role Key使用）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? null;
      const chargeType = (session.metadata?.charge_type ?? "")
        .toLowerCase()
        .trim();

      // 💰 金額に応じたクレジット加算
      let creditsToAdd = 0;
      if (chargeType.includes("3000")) creditsToAdd = 400;
      else if (chargeType.includes("1000")) creditsToAdd = 100;

      if (!userId) {
        console.warn("⚠️ Missing userId in session metadata");
        return NextResponse.json({ ok: false, reason: "No userId" });
      }

      console.log("📬 Webhook received:", {
        userId,
        chargeType,
        creditsToAdd,
      });

      // 🧭 現在のクレジット取得
      const { data: profile, error: fetchErr } = await supabase
        .from("user_profiles")
        .select("auth_user_id, credit_balance")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (fetchErr) {
        console.error("⚠️ DB fetch error:", fetchErr);
        return NextResponse.json({ ok: false, reason: "Fetch failed" });
      }

      const currentCredits = Number(profile?.credit_balance ?? 0);
      const newCredits = currentCredits + creditsToAdd;

      // 📅 有効期限 +30日
      const plus30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // 🔁 更新
      const { error: updateErr } = await supabase
        .from("user_profiles")
        .update({
          plan: "pro",
          credit_balance: newCredits,
          trial_end: plus30d.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("auth_user_id", userId);

      if (updateErr) {
        console.error("⚠️ Update failed:", updateErr);
        return NextResponse.json({ ok: false, reason: "Update failed" });
      }

      console.log("✅ Credit balance updated successfully", {
        userId,
        added: creditsToAdd,
        total: newCredits,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("💥 Webhook internal error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal Server Error" },
      { status: 500 }
    );
  }
}
