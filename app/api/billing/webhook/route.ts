// /app/api/billing/webhook/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  console.log("🚀 Webhook triggered");

  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "No signature" }, { status: 400 });

  const rawBody = await req.text();

  const Stripe = require("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log("✅ Stripe event received:", event.type);
  } catch (err: any) {
    console.error("❌ Stripe signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const chargeType = session.metadata?.charge_type;

    console.log("🧩 Metadata parsed", { userId, chargeType });

    if (!userId) {
      console.warn("⚠️ No userId in metadata");
      return NextResponse.json({ ok: false });
    }

    const { data: profile, error: fetchErr } = await supabase
      .from("user_profiles")
      .select("credit_balance")
      .eq("id", userId)
      .single();

    console.log("📄 Fetched profile", { profile, fetchErr });

    if (fetchErr) {
      console.error("❌ Failed to fetch profile:", fetchErr);
      return NextResponse.json({ error: "Fetch error" }, { status: 500 });
    }

    const creditsToAdd = chargeType === "3000yen" ? 400 : 100;
    const newBalance = (profile?.credit_balance || 0) + creditsToAdd;

    console.log("💰 Updating balance", {
      old: profile?.credit_balance,
      new: newBalance,
    });

    const { error: updateErr } = await supabase
      .from("user_profiles")
      .update({
        credit_balance: newBalance,
        plan: "pro",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateErr) {
      console.error("❌ Failed to update profile:", updateErr);
    } else {
      console.log("✅ Credit balance updated successfully!");
    }
  }

  return NextResponse.json({ ok: true });
}
