import { NextResponse } from "next/server";
import { isDesktopRuntimeEnabled } from "@/lib/desktop/desktopPaths";
import {
  initCharacterSettings,
  loadCharacterSettings,
  sanitizeCharacterId,
  saveCharacterSettings,
} from "@/lib/desktop/desktopSettingsStore";
import type { DesktopCharacterSettings } from "@/lib/desktop/desktopSettingsTypes";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  if (!isDesktopRuntimeEnabled()) return jsonError("Desktop runtime is not enabled.", 404);
  const u = new URL(req.url);
  const char = sanitizeCharacterId(u.searchParams.get("char") ?? "");
  if (!char) return jsonError("Invalid char.", 400);

  const s = await loadCharacterSettings(char);
  if (!s) return NextResponse.json({ ok: true, exists: false, settings: null });
  return NextResponse.json({ ok: true, exists: true, settings: s });
}

export async function POST(req: Request) {
  if (!isDesktopRuntimeEnabled()) return jsonError("Desktop runtime is not enabled.", 404);
  const u = new URL(req.url);
  const char = sanitizeCharacterId(u.searchParams.get("char") ?? "");
  if (!char) return jsonError("Invalid char.", 400);

  const body = (await req.json().catch(() => null)) as
    | { action?: unknown; settings?: unknown }
    | null;
  const action = String(body?.action ?? "");

  if (action === "init") {
    const s = await initCharacterSettings(char);
    return NextResponse.json({ ok: true, settings: s });
  }

  if (action === "save") {
    const settings = body?.settings as DesktopCharacterSettings | null;
    if (!settings || settings.characterId !== char) return jsonError("Invalid settings.", 400);
    const saved = await saveCharacterSettings(settings);
    return NextResponse.json({ ok: true, settings: saved });
  }

  return jsonError("Unknown action.", 400);
}

