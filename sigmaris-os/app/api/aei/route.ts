export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

type TraitTriplet = {
  calm: number;
  empathy: number;
  curiosity: number;
};

function coreBaseUrl() {
  const raw =
    process.env.SIGMARIS_CORE_URL ||
    process.env.NEXT_PUBLIC_SIGMARIS_CORE ||
    "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

/* -----------------------------------------------------
 * GET: セッションのメッセージ一覧（Supabase）
 * --------------------------------------------------- */
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
    let tempUser: string | null = null;

    (data ?? []).forEach((m: any) => {
      if (m.role === "user") tempUser = m.content;
      else {
        paired.push({ user: tempUser ?? "", ai: m.content ?? "" });
        tempUser = null;
      }
    });

    if (tempUser !== null) paired.push({ user: tempUser, ai: "" });

    return NextResponse.json({ messages: paired });
  } catch {
    return NextResponse.json({ messages: [] }, { status: 500 });
  }
}

/* -----------------------------------------------------
 * POST: Persona OS backend (/persona/chat) に中継
 *   - 課金/クレジットの概念は扱わない（ログインのみ必須）
 * --------------------------------------------------- */
export async function POST(req: Request) {
  const step: any = { phase: "start" };

  try {
    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      lang?: string;
    };

    const rawUserText = String(body?.text ?? "").trim();
    if (!rawUserText) {
      return NextResponse.json({ error: "Empty message", step }, { status: 400 });
    }

    const sessionId = req.headers.get("x-session-id") || randomUUID().toString();
    step.sessionId = sessionId;

    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", step }, { status: 401 });
    }

    const coreUrl = coreBaseUrl();
    step.coreUrl = coreUrl;

    const coreRes = await fetch(`${coreUrl}/persona/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        session_id: sessionId,
        message: rawUserText,
        meta: {
          client: "sigmaris-os",
          lang: body?.lang ?? null,
        },
      }),
    });

    const coreJson = (await coreRes.json().catch(() => null)) as any;
    if (!coreRes.ok) {
      return NextResponse.json(
        {
          error: "Sigmaris core request failed",
          detail: coreJson,
          step,
        },
        { status: 502 }
      );
    }

    const reply: string =
      typeof coreJson?.reply === "string"
        ? coreJson.reply
        : "（応答の取得に失敗しました）";

    const meta = coreJson?.meta ?? null;
    const traitState: TraitTriplet | null = meta?.trait?.state ?? null;

    const supabase = getSupabaseServer();
    const now = new Date().toISOString();
    await supabase.from("messages").insert([
      {
        user_id: user.id,
        session_id: sessionId,
        role: "user",
        content: rawUserText,
        created_at: now,
      },
      {
        user_id: user.id,
        session_id: sessionId,
        role: "ai",
        content: reply,
        created_at: now,
      },
    ]);

    // Persona OS の内部状態（meta）を数値化して保存（ダッシュボード/グラフ用）
    try {
      const traceId: string | null =
        typeof meta?.trace_id === "string" ? meta.trace_id : null;

      const globalState: string | null =
        typeof meta?.global_state?.state === "string" ? meta.global_state.state : null;

      const overloadScore: number | null =
        typeof meta?.controller_meta?.overload_score === "number"
          ? meta.controller_meta.overload_score
          : typeof meta?.global_state?.meta?.overload_score === "number"
            ? meta.global_state.meta.overload_score
            : null;

      const reflectiveScore: number | null =
        typeof meta?.global_state?.meta?.reflective_score === "number"
          ? meta.global_state.meta.reflective_score
          : null;

      const memoryPointerCount: number | null =
        typeof meta?.controller_meta?.memory?.pointer_count === "number"
          ? meta.controller_meta.memory.pointer_count
          : typeof meta?.memory?.initial_pointer_count === "number"
            ? meta.memory.initial_pointer_count
            : null;

      const safetyFlag: string | null =
        typeof meta?.safety?.flag === "string"
          ? meta.safety.flag
          : typeof meta?.controller_meta?.safety_flag === "string"
            ? meta.controller_meta.safety_flag
            : typeof meta?.global_state?.meta?.safety_flag === "string"
              ? meta.global_state.meta.safety_flag
              : null;

      const safetyRiskScore: number | null =
        typeof meta?.safety?.risk_score === "number" ? meta.safety.risk_score : null;

      await supabase.from("sigmaris_state_snapshots").insert([
        {
          user_id: user.id,
          session_id: sessionId,
          trace_id: traceId,
          global_state: globalState,
          overload_score: overloadScore,
          reflective_score: reflectiveScore,
          memory_pointer_count: memoryPointerCount,
          safety_flag: safetyFlag,
          safety_risk_score: safetyRiskScore,
          value_state: meta?.value?.state ?? null,
          trait_state: meta?.trait?.state ?? null,
          meta,
          created_at: now,
        },
      ]);
    } catch (e) {
      console.warn("[/api/aei] state snapshot insert failed:", e);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      output: reply,
      traits: traitState ?? undefined,
      safety: meta?.safety ?? undefined,
      model: meta?.io?.model ?? process.env.SIGMARIS_PERSONA_MODEL ?? "sigmaris-core",
      python: meta ?? undefined,
    });
  } catch (err: any) {
    step.error = err?.message ?? String(err);
    return NextResponse.json({ error: "Internal Error", step }, { status: 500 });
  }
}
