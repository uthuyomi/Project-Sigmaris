// /app/api/credits/use/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * 💰 クレジット消費API
 * ----------------------------------------
 * - ログイン済ユーザーのみ利用可
 * - Supabase Cookie セッションを使用
 * - 残高が 1 以上あれば -1 して更新
 * - 0 以下なら 402 (Payment Required)
 * ----------------------------------------
 */
export async function POST() {
  try {
    // 🔹 Supabase クライアント（Cookie認証つき）
    const supabase = createRouteHandlerClient({ cookies });

    // 🔹 ユーザー情報を取得
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access to /api/credits/use");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 🔹 残高取得
    const { data: profile, error: fetchErr } = await supabase
      .from("user_profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .single();

    if (fetchErr || !profile) {
      console.error("⚠️ Failed to fetch user profile:", fetchErr);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentCredits = profile.credit_balance ?? 0;

    // ⚠️ 残高不足チェック
    if (currentCredits <= 0) {
      console.warn(`💸 [${user.id}] Insufficient credits`);
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 }
      );
    }

    const newCredits = currentCredits - 1;

    // 🔹 クレジット更新
    const { error: updateErr } = await supabase
      .from("user_profiles")
      .update({
        credit_balance: newCredits,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateErr) {
      console.error("⚠️ Failed to update credits:", updateErr);
      return NextResponse.json(
        { error: "Failed to update credits" },
        { status: 500 }
      );
    }

    console.log(`💳 [${user.id}] credit used → ${newCredits}`);

    // 🔹 成功レスポンス
    return NextResponse.json({
      success: true,
      credit_balance: newCredits,
    });
  } catch (err) {
    console.error("❌ [CreditsAPI Fatal Error]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
