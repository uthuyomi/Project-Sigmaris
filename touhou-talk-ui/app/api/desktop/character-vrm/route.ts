import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import {
  characterRootDir,
  characterVrmPath,
  getDesktopUserDataDir,
  isDesktopRuntimeEnabled,
} from "@/lib/desktop/desktopPaths";
import {
  loadCharacterSettings,
  sanitizeCharacterId,
  saveCharacterSettings,
} from "@/lib/desktop/desktopSettingsStore";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  if (!isDesktopRuntimeEnabled()) return jsonError("Desktop runtime is not enabled.", 404);
  const u = new URL(req.url);
  const char = sanitizeCharacterId(u.searchParams.get("char") ?? "");
  if (!char) return jsonError("Invalid char.", 400);

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("Missing form data.", 400);
  const f = form.get("file");
  if (!(f instanceof File)) return jsonError("Missing file.", 400);

  const userData = getDesktopUserDataDir();
  if (!userData) return jsonError("Desktop runtime is not enabled.", 404);

  const root = characterRootDir(userData, char);
  await fs.mkdir(root, { recursive: true });
  const outPath = characterVrmPath(userData, char);

  const ab = await f.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(ab));

  const prev = (await loadCharacterSettings(char)) ?? null;
  if (prev) {
    const next = {
      ...prev,
      vrm: { ...prev.vrm, enabled: true, path: "avatar.vrm" },
    };
    await saveCharacterSettings(next);
  }

  return NextResponse.json({ ok: true, path: outPath });
}

