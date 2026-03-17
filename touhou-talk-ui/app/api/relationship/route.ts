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

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const userId = await requireUserId();

    const url = new URL(req.url);
    const characterId = (url.searchParams.get("characterId") || "").trim();
    const scopeKey = (url.searchParams.get("scopeKey") || "global").trim() || "global";

    const relQuery = supabase
      .from("player_character_relations")
      .select("character_id, scope_key, trust, familiarity, last_updated");

    const relRes = characterId
      ? await relQuery.eq("user_id", userId).eq("character_id", characterId).maybeSingle()
      : await relQuery.eq("user_id", userId).order("last_updated", { ascending: false });

    if (relRes.error) {
      return NextResponse.json({ error: "relationship_query_failed", detail: relRes.error }, { status: 500 });
    }

    const relationships = characterId
      ? relRes.data
        ? [
            {
              characterId: String((relRes.data as any).character_id ?? characterId),
              scopeKey: String((relRes.data as any).scope_key ?? "global"),
              trust: clampNum((relRes.data as any).trust ?? 0, -1, 1, 0),
              familiarity: clampNum((relRes.data as any).familiarity ?? 0, 0, 1, 0),
              lastUpdated: (relRes.data as any).last_updated ? String((relRes.data as any).last_updated) : null,
            },
          ]
        : []
      : Array.isArray(relRes.data)
        ? (relRes.data as any[]).map((r) => ({
            characterId: String(r?.character_id ?? ""),
            scopeKey: String(r?.scope_key ?? "global"),
            trust: clampNum(r?.trust ?? 0, -1, 1, 0),
            familiarity: clampNum(r?.familiarity ?? 0, 0, 1, 0),
            lastUpdated: r?.last_updated ? String(r.last_updated) : null,
          }))
        : [];

    const memRes = await supabase
      .from("touhou_user_memory")
      .select("scope_key, topics, emotions, recurring_issues, traits, updated_at")
      .eq("user_id", userId)
      .eq("scope_key", scopeKey)
      .maybeSingle();

    const memory = memRes.error
      ? null
      : memRes.data
        ? {
            scopeKey: String((memRes.data as any).scope_key ?? scopeKey),
            topics: isStringArray((memRes.data as any).topics) ? ((memRes.data as any).topics as string[]) : [],
            emotions: isStringArray((memRes.data as any).emotions) ? ((memRes.data as any).emotions as string[]) : [],
            recurringIssues: isStringArray((memRes.data as any).recurring_issues)
              ? ((memRes.data as any).recurring_issues as string[])
              : [],
            traits: isStringArray((memRes.data as any).traits) ? ((memRes.data as any).traits as string[]) : [],
            updatedAt: (memRes.data as any).updated_at ? String((memRes.data as any).updated_at) : null,
          }
        : null;

    return NextResponse.json({ relationships, memory });
  } catch (e) {
    return NextResponse.json({ error: "unauthorized", detail: String(e ?? "") }, { status: 401 });
  }
}

