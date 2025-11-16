// /app/api/aei/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { PersonaSync } from "@/engine/sync/PersonaSync";

import type { TraitVector } from "@/lib/traits";
import type { SafetyReport } from "@/types/safety";

// ⭐ Sigmaris OS
import { createInitialContext } from "@/engine/state/StateContext";
import { StateMachine } from "@/engine/state/StateMachine";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/** 🧩 危険語フィルタ */
function guardianFilter(text: string) {
  const banned = /(殺|死|暴力|自殺|危険|犯罪|攻撃)/;
  const flagged = banned.test(text);
  return flagged
    ? {
        safeText:
          "ごめんね、その話題は慎重に扱いたいな。別の方向から考えてみようか？",
        flagged: true,
      }
    : { safeText: text, flagged: false };
}

/** GET: 履歴取得（既存→変更なし） */
export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ messages: [] });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session");
    if (!sessionId) return NextResponse.json({ messages: [] });

    const supabase = getSupabaseServer();
    const { data } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const paired: { user: string; ai: string }[] = [];
    let pendingUser: string | null = null;

    (data ?? []).forEach((r: any) => {
      if (r.role === "user") pendingUser = r.content;
      else {
        paired.push({ user: pendingUser ?? "", ai: r.content ?? "" });
        pendingUser = null;
      }
    });

    if (pendingUser !== null) paired.push({ user: pendingUser, ai: "" });

    return NextResponse.json({ messages: paired });
  } catch (e: any) {
    return NextResponse.json({ messages: [] }, { status: 500 });
  }
}

/** POST: Sigmaris OS — StateMachine応答 */
export async function POST(req: Request) {
  const step: any = { phase: "POST-start" };

  try {
    const body = await req.json();
    const { text } = body;
    const userText = text?.trim() || "こんにちは";

    const sessionId = req.headers.get("x-session-id") || crypto.randomUUID();

    // 🔐 認証
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user)
      return NextResponse.json(
        { error: "Unauthorized", step },
        { status: 401 }
      );

    const supabase = getSupabaseServer();

    // 💳 クレジット確認
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .single();

    const currentCredits = profile?.credit_balance ?? 0;
    step.credit = currentCredits;

    if (currentCredits <= 0) {
      const message =
        "💬 クレジットが不足しています。チャージまたはプラン変更を行ってください。";
      const now = new Date().toISOString();

      await supabase.from("messages").insert([
        {
          user_id: user.id,
          session_id: sessionId,
          role: "user",
          content: userText,
          created_at: now,
        },
        {
          user_id: user.id,
          session_id: sessionId,
          role: "ai",
          content: message,
          created_at: now,
        },
      ]);

      return NextResponse.json({ success: false, output: message });
    }

    // クレジット減算
    await supabase
      .from("user_profiles")
      .update({ credit_balance: currentCredits - 1 })
      .eq("id", user.id);

    // 🧠 Personaロード
    const persona = await PersonaSync.load(user.id);
    const traits: TraitVector = {
      calm: persona.calm ?? 0.5,
      empathy: persona.empathy ?? 0.5,
      curiosity: persona.curiosity ?? 0.5,
    };

    // ===============================
    //   Sigmaris OS: StateMachine へ
    // ===============================

    // ▼ StateContext 構築
    const ctx = createInitialContext();
    ctx.input = userText;
    ctx.traits = traits;

    // ▼ SafetyLayer（Trait安定化 + 暴走チェック）
    ctx.traits = SafetyLayer.stabilize(ctx.traits);

    const safetyMessage = SafetyLayer.checkOverload(ctx.traits);

    // ⭐ SafetyReport 型に完全準拠させる修正版
    ctx.safety = safetyMessage
      ? ({
          flags: {
            selfReference: false,
            abstractionOverload: true,
            loopSuspect: false,
          },
          action: "rewrite-soft",
          note: safetyMessage,
          suggestMode: "calm-down",
        } as SafetyReport)
      : ({
          flags: {
            selfReference: false,
            abstractionOverload: false,
            loopSuspect: false,
          },
          action: "allow",
          note: "",
        } as SafetyReport);

    // ▼ StateMachine 実行
    const machine = new StateMachine(ctx);
    const finalCtx = await machine.run();

    let aiOutput = finalCtx.output;
    const updatedTraits = finalCtx.traits;

    // ▼ 危険語フィルタ
    const gf = guardianFilter(aiOutput);
    aiOutput = gf.safeText;

    // ▼ Trait保存
    await PersonaSync.update(
      updatedTraits,
      "",
      (updatedTraits.calm + updatedTraits.empathy + updatedTraits.curiosity) /
        3,
      user.id
    );

    // ▼ Supabaseメッセージ保存
    const now = new Date().toISOString();

    await supabase.from("messages").insert([
      {
        user_id: user.id,
        session_id: sessionId,
        role: "user",
        content: userText,
        created_at: now,
      },
      {
        user_id: user.id,
        session_id: sessionId,
        role: "ai",
        content: aiOutput,
        created_at: now,
      },
    ]);

    return NextResponse.json({
      success: true,
      output: aiOutput,
      traits: updatedTraits,
      safety: ctx.safety,
      sessionId,
      step,
    });
  } catch (e: any) {
    step.error = e?.message;
    return NextResponse.json(
      { error: e?.message || "Unknown error", step },
      { status: 500 }
    );
  }
}
