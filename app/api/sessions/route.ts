import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * === GET: セッション一覧取得 ===
 * - ユーザーの全 session_id を返す
 * - 各セッションのタイトル・最終発言・更新時刻・件数を含む
 */
export async function GET() {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access attempt to /api/sessions");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const supabase = getSupabaseServer();

    // === 1. messages テーブルから session_id ごとのメッセージ抽出 ===
    const { data, error } = await supabase
      .from("messages")
      .select("session_id, content, role, created_at, session_title")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return NextResponse.json({ sessions: [] });

    // === 2. セッションごとにグループ化 ===
    const sessionMap = new Map<
      string,
      { lastMessage: string; updatedAt: string; count: number; title: string }
    >();

    for (const msg of data) {
      const sid = msg.session_id || "default-session";
      const content = msg.content ?? "";
      if (!sessionMap.has(sid)) {
        sessionMap.set(sid, {
          lastMessage: content.slice(0, 60),
          updatedAt: msg.created_at,
          count: 1,
          title: msg.session_title || `セッション ${sid.slice(0, 8)}`, // DBにタイトルがあれば優先
        });
      } else {
        const entry = sessionMap.get(sid)!;
        entry.count += 1;
      }
    }

    // === 3. 配列化して更新順にソート ===
    const sessions = Array.from(sessionMap.entries())
      .map(([id, info]) => ({
        id,
        title: info.title,
        lastMessage: info.lastMessage,
        updatedAt: info.updatedAt,
        messageCount: info.count,
      }))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

    console.log(`📦 ${sessions.length} sessions loaded for user ${userId}`);
    return NextResponse.json({ sessions });
  } catch (err: any) {
    console.error("[/api/sessions GET] failed:", err);
    return NextResponse.json(
      { error: err.message ?? String(err) },
      { status: 500 }
    );
  }
}

/**
 * === PATCH: セッションタイトル変更 ===
 * - 指定した session_id のタイトルを更新
 * - messages に含まれる session_title を更新
 */
export async function PATCH(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access attempt to /api/sessions PATCH");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const { sessionId, newTitle } = await req.json();

    if (!sessionId || !newTitle) {
      return NextResponse.json(
        { error: "Missing sessionId or newTitle" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    const { error } = await supabase
      .from("messages")
      .update({ session_title: newTitle })
      .eq("user_id", userId)
      .eq("session_id", sessionId);

    if (error) throw error;

    console.log(`✏️ Session ${sessionId} renamed to "${newTitle}"`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/sessions PATCH] failed:", err);
    return NextResponse.json(
      { error: err.message ?? String(err) },
      { status: 500 }
    );
  }
}

/**
 * === DELETE: セッション削除 ===
 * - 指定した session_id の履歴をすべて削除
 * - messages, reflections, growth_logs, safety_logs に対応
 */
export async function DELETE(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized access attempt to /api/sessions DELETE");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      console.warn("⚠️ Missing session_id in DELETE request");
      return NextResponse.json(
        { error: "Missing session id" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // === 削除対象テーブル ===
    const tables = ["messages", "reflections", "growth_logs", "safety_logs"];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("user_id", userId)
        .eq("session_id", sessionId);

      if (error) {
        console.warn(`⚠️ ${table} delete failed:`, error.message);
      }
    }

    console.log(`🗑️ Session ${sessionId} deleted for user ${userId}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/sessions DELETE] failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
