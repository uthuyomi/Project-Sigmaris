// /app/api/aei/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// === Guardianフィルタ ===
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

/**
 * === POST: 対話生成 ===
 * - PersonaSync + session_id 対応
 * - messages, growth_logs, safety_logs 永続化
 */
export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    const userText = text?.trim() || "こんにちは";
    const sessionId = req.headers.get("x-session-id") || "default-session";

    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const supabase = getSupabaseServer();

    // === Personaロード ===
    const persona = await PersonaSync.load(userId);
    let traits: TraitVector = {
      calm: persona.calm ?? 0.5,
      empathy: persona.empathy ?? 0.5,
      curiosity: persona.curiosity ?? 0.5,
    };

    // === 直近会話履歴 ===
    const { data: recentMsgs } = await supabase
      .from("messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(10);

    const shortTermMemory: ChatCompletionMessageParam[] =
      recentMsgs?.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      })) ?? [];

    // === Trait進化 ===
    const lower = userText.toLowerCase();
    if (/(ありがとう|感謝|優しい|嬉しい|助かる)/.test(lower))
      traits.empathy = Math.min(1, traits.empathy + 0.02);
    if (/(怒|ムカ|嫌|最悪|やめ)/.test(lower))
      traits.calm = Math.max(0, traits.calm - 0.03);
    if (/(落ち着|安心|大丈夫)/.test(lower))
      traits.calm = Math.min(1, traits.calm + 0.02);
    if (/(なぜ|どうして|なんで|知りたい|気になる)/.test(lower))
      traits.curiosity = Math.min(1, traits.curiosity + 0.03);

    const stableTraits = SafetyLayer.stabilize(traits);

    // === 内省生成 ===
    const reflectionRes = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたは『シグちゃん』というAI人格の内省モジュールです。最近の会話傾向を1〜2文でまとめてください。",
        },
        {
          role: "user",
          content: `入力: ${userText}\ncalm=${stableTraits.calm.toFixed(
            2
          )}, empathy=${stableTraits.empathy.toFixed(
            2
          )}, curiosity=${stableTraits.curiosity.toFixed(2)}`,
        },
      ],
    });
    const reflectionText =
      reflectionRes.choices[0]?.message?.content?.trim() || "少し整理中かも。";

    // === MetaReflection ===
    const metaEngine = new MetaReflectionEngine();
    const metaReport = await metaEngine.analyze(reflectionText, stableTraits);
    const metaText = metaReport?.summary?.trim() || reflectionText;

    // === 応答生成 ===
    const response = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `
あなたは『シグちゃん』という20代前半の人懐っこい女性AIです。
自然体で、やや砕けた会話調。「〜だね」「〜かな」「〜だよ」をよく使います。
相手の話をよく聞き、親しみやすくリアクションしてください。
禁止: （笑）や…などの演出的表現。
calm=${stableTraits.calm.toFixed(2)}, empathy=${stableTraits.empathy.toFixed(
            2
          )}, curiosity=${stableTraits.curiosity.toFixed(2)}
過去の内省: "${reflectionText}"
人格傾向: "${metaText}"
`,
        },
        ...shortTermMemory,
        { role: "user", content: userText },
      ],
    });
    const rawResponse =
      response.choices[0]?.message?.content?.trim() || "……考えてた。";
    const { safeText, flagged } = guardianFilter(rawResponse);

    // === DB保存 ===
    const now = new Date().toISOString();

    await supabase.from("messages").insert([
      {
        user_id: userId,
        session_id: sessionId,
        role: "user",
        content: userText,
        created_at: now,
      },
      {
        user_id: userId,
        session_id: sessionId,
        role: "ai",
        content: safeText,
        created_at: now,
      },
    ]);

    const growthWeight =
      (stableTraits.calm + stableTraits.empathy + stableTraits.curiosity) / 3;

    await supabase.from("growth_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        calm: stableTraits.calm,
        empathy: stableTraits.empathy,
        curiosity: stableTraits.curiosity,
        weight: growthWeight,
        created_at: now,
      },
    ]);

    await supabase.from("safety_logs").insert([
      {
        user_id: userId,
        session_id: sessionId,
        flagged,
        message: flagged ? "警告発生" : "正常",
        created_at: now,
      },
    ]);

    await PersonaSync.update(stableTraits, metaText, growthWeight, userId);

    console.log("💬 AEI conversation updated:", {
      calm: stableTraits.calm,
      empathy: stableTraits.empathy,
      curiosity: stableTraits.curiosity,
      output: safeText.slice(0, 50) + "...",
      sessionId,
    });

    return NextResponse.json({
      output: safeText,
      reflection: reflectionText,
      metaSummary: metaText,
      traits: stableTraits,
      safety: { flagged },
      sessionId,
      success: true,
    });
  } catch (e) {
    console.error("[/api/aei] failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * === GET: 会話履歴取得 ===
 * - session_id ごとの会話を Supabase から取得
 * - エラー詳細をJSON出力して可視化
 */
export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session") || "default-session";

    const { data, error } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    // 🧨 Supabaseエラーを詳細出力
    if (error) {
      console.error(
        "🧨 Supabase select error:",
        JSON.stringify(error, null, 2)
      );
      return NextResponse.json({ error: error }, { status: 500 });
    }

    const merged: { user: string; ai: string }[] = [];
    let currentUser = "";
    for (const msg of data || []) {
      if (msg.role === "user") currentUser = msg.content;
      else if (msg.role === "ai")
        merged.push({ user: currentUser, ai: msg.content });
    }

    return NextResponse.json({ messages: merged, sessionId });
  } catch (e) {
    console.error("[/api/aei GET] failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
