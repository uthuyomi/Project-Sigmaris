export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * アカウント情報取得API
 * - 課金/クレジット/プラン概念を廃止したため、最小限のログイン情報のみ返す
 */
export async function GET() {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        ok: true,
        user: { id: user.id, email: user.email ?? null },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[/api/account/info] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

