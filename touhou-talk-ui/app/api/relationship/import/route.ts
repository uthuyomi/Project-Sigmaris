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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeStringArray(v: unknown, max: number) {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

type ImportPayload = {
  version?: number;
  relationships?: unknown;
  memories?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const userId = await requireUserId();

    const body = (await req.json().catch(() => null)) as ImportPayload | null;
    if (!body || !isRecord(body)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const relRows: any[] = Array.isArray(body.relationships) ? (body.relationships as any[]) : [];
    const relUpserts = relRows
      .map((r) => {
        const characterId = String(r?.character_id ?? "").trim();
        if (!characterId) return null;
        const scopeKey = String(r?.scope_key ?? "global").trim() || "global";
        const trust = clampNum(r?.trust ?? 0, -1, 1, 0);
        const familiarity = clampNum(r?.familiarity ?? 0, 0, 1, 0);
        return {
          user_id: userId,
          character_id: characterId,
          scope_key: scopeKey,
          trust,
          familiarity,
          last_updated: nowIso,
        };
      })
      .filter(Boolean) as any[];

    if (relUpserts.length) {
      const { error } = await supabase.from("player_character_relations").upsert(relUpserts as any, {
        onConflict: "user_id,character_id",
      });
      if (error) return NextResponse.json({ error: "relationship_import_failed", detail: error }, { status: 500 });
    }

    const memRows: any[] = Array.isArray(body.memories) ? (body.memories as any[]) : [];
    const memUpserts = memRows
      .map((r) => {
        const scopeKey = String(r?.scope_key ?? "global").trim() || "global";
        return {
          user_id: userId,
          scope_key: scopeKey,
          topics: normalizeStringArray(r?.topics, 48),
          emotions: normalizeStringArray(r?.emotions, 48),
          recurring_issues: normalizeStringArray(r?.recurring_issues, 48),
          traits: normalizeStringArray(r?.traits, 48),
          updated_at: nowIso,
        };
      })
      .filter(Boolean) as any[];

    if (memUpserts.length) {
      const { error } = await supabase.from("touhou_user_memory").upsert(memUpserts as any, {
        onConflict: "user_id,scope_key",
      });
      if (error) return NextResponse.json({ error: "memory_import_failed", detail: error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, relationships: relUpserts.length, memories: memUpserts.length });
  } catch (e) {
    return NextResponse.json({ error: "unauthorized", detail: String(e ?? "") }, { status: 401 });
  }
}

