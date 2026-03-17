export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import "server-only";

import { requireUserId, supabaseServer } from "@/lib/supabase-server";

function clampNum(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

type ResetRequest = {
  characterId?: string | null;
  scopeKey?: string | null;
  resetRelationships?: boolean | null;
  resetMemory?: boolean | null;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const userId = await requireUserId();

    const body = (await req.json().catch(() => ({}))) as ResetRequest;
    const characterId = String(body.characterId ?? "").trim();
    const scopeKey = String(body.scopeKey ?? "global").trim() || "global";
    const resetRelationships = body.resetRelationships !== false;
    const resetMemory = body.resetMemory !== false;

    const nowIso = new Date().toISOString();

    if (resetRelationships) {
      if (characterId) {
        const prev = await supabase
          .from("player_character_relations")
          .select("rev")
          .eq("user_id", userId)
          .eq("character_id", characterId)
          .maybeSingle();
        const prevRev = clampNum((prev.data as any)?.rev ?? 0, 0, Number.MAX_SAFE_INTEGER, 0);

        const { error } = await supabase.from("player_character_relations").upsert(
          {
            user_id: userId,
            character_id: characterId,
            scope_key: scopeKey,
            trust: 0,
            familiarity: 0,
            rev: prevRev + 1,
            last_updated: nowIso,
          } as any,
          { onConflict: "user_id,character_id" },
        );
        if (error) return NextResponse.json({ error: "reset_relationship_failed", detail: error }, { status: 500 });
      } else {
        const { error } = await supabase
          .from("player_character_relations")
          .update({ trust: 0, familiarity: 0, last_updated: nowIso } as any)
          .eq("user_id", userId);
        if (error) return NextResponse.json({ error: "reset_relationships_failed", detail: error }, { status: 500 });
      }
    }

    if (resetMemory) {
      const prev = await supabase
        .from("touhou_user_memory")
        .select("rev")
        .eq("user_id", userId)
        .eq("scope_key", scopeKey)
        .maybeSingle();
      const prevRev = clampNum((prev.data as any)?.rev ?? 0, 0, Number.MAX_SAFE_INTEGER, 0);

      const { error } = await supabase.from("touhou_user_memory").upsert(
        {
          user_id: userId,
          scope_key: scopeKey,
          topics: [],
          emotions: [],
          recurring_issues: [],
          traits: [],
          rev: prevRev + 1,
          updated_at: nowIso,
        } as any,
        { onConflict: "user_id,scope_key" },
      );
      if (error) return NextResponse.json({ error: "reset_memory_failed", detail: error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "unauthorized", detail: String(e ?? "") }, { status: 401 });
  }
}

