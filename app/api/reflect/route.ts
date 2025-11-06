// /app/api/reflect/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

import { ReflectionEngine } from "@/engine/ReflectionEngine";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";
import type { MetaReport } from "@/engine/meta/MetaReflectionEngine";

console.log("🌐 /api/reflect endpoint loaded");

interface ReflectionResult {
  reflection: string;
  introspection: string;
  metaSummary: string;
  safety: string;
  metaReport?: MetaReport;
  traits?: TraitVector;
  flagged?: boolean;
}

/**
 * === POST: Reflection 実行エンドポイント ===
 * - ReflectionEngine → MetaReflectionEngine → PersonaSync（Supabase同期）
 * - Supabase上の `reflections`, `growth_logs`, `safety_logs`, `persona` を更新
 * - session_id でチャット履歴を紐づけ
 */
export async function POST(req: Request) {
  try {
    // === 入力受け取り ===
    const body = (await req.json()) as {
      messages?: any[];
      growthLog?: any[];
      history?: string[];
    };

    const messages = body.messages ?? [];
    const growthLog = body.growthLog ?? [];
    const history = body.history ?? [];

    // === セッションID取得（x-session-id ヘッダー or default）===
    const sessionId = req.headers.get("x-session-id") || "default-session";

    // === 認証情報取得 ===
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access attempt to /api/reflect");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const now = new Date().toISOString();

    console.log("🚀 [ReflectAPI] Start reflection for:", { userId, sessionId });

    // === ReflectionEngine 実行 ===
    const engine = new ReflectionEngine();
    const result = (await engine.fullReflect(
      growthLog,
      messages,
      history,
      userId
    )) as ReflectionResult;

    if (!result) {
      console.warn("⚠️ ReflectionEngine returned null");
      return NextResponse.json(
        { error: "ReflectionEngine returned null", success: false },
        { status: 500 }
      );
    }

    // === 結果抽出 ===
    const reflectionText = result.reflection ?? "（内省なし）";
    const introspection = result.introspection ?? "";
    const metaSummary = result.metaSummary ?? "";
    const safety = result.safety ?? "正常";
    const metaReport = result.metaReport ?? null;
    const traits = result.traits ?? null;
    const flagged = result.flagged ?? false;

    console.log("🪞 Reflection result:", {
      reflectionText,
      metaSummary,
      traits,
      safety,
      flagged,
    });

    // === Supabase クライアント初期化 ===
    const supabase = getSupabaseServer();

    // 🧠 1. reflections 履歴を保存（session_id対応）
    const { error: refError } = await supabase.from("reflections").insert([
      {
        user_id: userId,
        session_id: sessionId, // ✅ 追加
        reflection: reflectionText,
        introspection,
        meta_summary: metaSummary,
        safety_status: safety,
        created_at: now,
      },
    ]);
    if (refError)
      console.warn("⚠️ reflections insert failed:", refError.message);

    // 💾 2. PersonaSync + growth_logs 更新
    if (traits) {
      console.log("🧩 Updating PersonaSync & growth logs...");
      try {
        await PersonaSync.update(
          traits,
          metaSummary,
          metaReport?.growthAdjustment ?? 0,
          userId
        );
        console.log("✅ PersonaSync.update success:", traits);
      } catch (e) {
        console.error("⚠️ PersonaSync.update failed:", e);
      }

      const growthWeight =
        (traits.calm + traits.empathy + traits.curiosity) / 3;

      const { error: growError } = await supabase.from("growth_logs").insert([
        {
          user_id: userId,
          session_id: sessionId, // ✅ 追加
          calm: traits.calm,
          empathy: traits.empathy,
          curiosity: traits.curiosity,
          weight: growthWeight,
          created_at: now,
        },
      ]);
      if (growError)
        console.warn("⚠️ growth_logs insert failed:", growError.message);
      else console.log("📈 Growth log updated:", growthWeight.toFixed(3));
    } else {
      console.warn("⚠️ No traits found in reflection result — Persona skipped");
    }

    // 🧩 3. safety_logs 保存
    const { error: safeError } = await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId, // ✅ 追加
        flagged: safety !== "正常" || flagged,
        message: safety,
        created_at: now,
      },
    ]);
    if (safeError)
      console.warn("⚠️ safety_logs insert failed:", safeError.message);

    console.log("✅ Reflection process complete for:", { userId, sessionId });

    // === レスポンス ===
    return NextResponse.json({
      reflection: reflectionText,
      introspection,
      metaSummary,
      safety,
      metaReport,
      traits,
      flagged,
      sessionId,
      updatedHistory: [...history, introspection],
      success: true,
    });
  } catch (err: any) {
    console.error("[ReflectAPI Error]", err);
    return NextResponse.json(
      {
        reflection: "……うまく振り返れなかったみたい。",
        error: err?.message ?? String(err),
        success: false,
      },
      { status: 500 }
    );
  }
}
