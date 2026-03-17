export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import "server-only";

import { requireUserId, supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const userId = await requireUserId();

    const relRes = await supabase
      .from("player_character_relations")
      .select("character_id, scope_key, trust, familiarity, last_updated")
      .eq("user_id", userId);

    const memRes = await supabase
      .from("touhou_user_memory")
      .select("scope_key, topics, emotions, recurring_issues, traits, updated_at")
      .eq("user_id", userId);

    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      relationships: (relRes.data as any[] | null) ?? [],
      memories: (memRes.data as any[] | null) ?? [],
    };

    const body = JSON.stringify(payload, null, 2);
    const fileName = `touhou-talk-relationship-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "unauthorized", detail: String(e ?? "") }, { status: 401 });
  }
}

