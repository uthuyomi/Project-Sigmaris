// /app/api/credits/use/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * 💰 クレジット消費API
 * - ログイン済ユーザーのみ利用可
 * - 残高が1以上あれば -1 して返す
 * - 0以下なら 402 エラー（Payment Required）
 */
export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });

  // ✅ ユーザー確認
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // ✅ ユーザーの残高を取得
  const { data: profile, error: fetchErr } = await supabase
    .from("user_profiles")
    .select("credit_balance")
    .eq("id", user.id)
    .single();

  if (fetchErr || !profile) {
    console.error("⚠️ Failed to fetch user:", fetchErr);
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const currentCredits = profile.credit_balance ?? 0;

  // ⚠️ 残高不足
  if (currentCredits <= 0) {
    return NextResponse.json(
      { error: "Insufficient credits" },
      { status: 402 }
    );
  }

  const newCredits = currentCredits - 1;

  // ✅ クレジット更新
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

  console.log(`💳 [${user.id}] credit used: ${currentCredits} → ${newCredits}`);

  return NextResponse.json({
    success: true,
    credit_balance: newCredits,
  });
}
