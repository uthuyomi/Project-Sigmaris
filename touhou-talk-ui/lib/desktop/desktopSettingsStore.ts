import fs from "node:fs/promises";
import path from "node:path";
import {
  characterRootDir,
  characterSettingsPath,
  getDesktopUserDataDir,
} from "@/lib/desktop/desktopPaths";
import {
  defaultCharacterSettings,
  type DesktopCharacterSettings,
} from "@/lib/desktop/desktopSettingsTypes";

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export function requireDesktopUserDataDir(): string {
  const p = getDesktopUserDataDir();
  if (!p) throw new Error("Desktop userData dir is not configured.");
  return p;
}

export async function loadCharacterSettings(
  characterId: string,
): Promise<DesktopCharacterSettings | null> {
  const userData = getDesktopUserDataDir();
  if (!userData) return null;
  const p = characterSettingsPath(userData, characterId);
  try {
    const raw = await fs.readFile(p, "utf8");
    const j = JSON.parse(raw) as Partial<DesktopCharacterSettings> | null;
    if (!j || j.schemaVersion !== 1) return null;
    return normalizeCharacterSettings(j, characterId);
  } catch {
    return null;
  }
}

function normalizeCharacterSettings(
  j: Partial<DesktopCharacterSettings>,
  characterId: string,
): DesktopCharacterSettings {
  const base = defaultCharacterSettings(characterId);
  const aqIn = (j.tts as any)?.aquestalk ?? {};

  const vrmEnabledRaw =
    typeof (j as any)?.vrm?.enabled === "boolean" ? (j as any).vrm.enabled : base.vrm.enabled;
  const vrmPathRaw =
    typeof (j as any)?.vrm?.path === "string" || (j as any)?.vrm?.path == null
      ? ((j as any).vrm?.path ?? base.vrm.path)
      : base.vrm.path;
  // If a VRM path is not set, treat it as disabled even if the flag is true.
  const vrmEnabled = Boolean(vrmEnabledRaw && typeof vrmPathRaw === "string" && vrmPathRaw.trim());

  const motionsEnabledRaw =
    typeof (j as any)?.motions?.enabled === "boolean"
      ? (j as any).motions.enabled
      : base.motions.enabled;
  const motionsIndexRaw =
    typeof (j as any)?.motions?.indexPath === "string" || (j as any)?.motions?.indexPath == null
      ? ((j as any).motions?.indexPath ?? base.motions.indexPath)
      : base.motions.indexPath;
  const motionsEnabled = Boolean(
    motionsEnabledRaw && typeof motionsIndexRaw === "string" && motionsIndexRaw.trim(),
  );

  return {
    ...base,
    ...j,
    characterId,
    vrm: {
      ...base.vrm,
      ...(j.vrm ?? {}),
      enabled: vrmEnabled,
      path: vrmEnabled ? String(vrmPathRaw).trim() : null,
    },
    tts: {
      ...base.tts,
      ...(j.tts ?? {}),
      mode:
        (j.tts as any)?.mode === "none" || (j.tts as any)?.mode === "browser" || (j.tts as any)?.mode === "aquestalk"
          ? (j.tts as any).mode
          : base.tts.mode,
      aquestalk: {
        ...base.tts.aquestalk,
        enabled: typeof aqIn.enabled === "boolean" ? aqIn.enabled : base.tts.aquestalk.enabled,
        rootDir: typeof aqIn.rootDir === "string" ? aqIn.rootDir : null,
        speed: Number.isFinite(Number(aqIn.speed)) ? Number(aqIn.speed) : base.tts.aquestalk.speed,
        voice: typeof aqIn.voice === "string" ? aqIn.voice : base.tts.aquestalk.voice,
      },
    },
    motions: {
      ...base.motions,
      ...(j.motions ?? {}),
      enabled: motionsEnabled,
      indexPath:
        motionsEnabled ? String(motionsIndexRaw).trim() : null,
    },
    updatedAt: typeof (j as any)?.updatedAt === "string" ? (j as any).updatedAt : base.updatedAt,
  };
}

export async function initCharacterSettings(characterId: string) {
  const userData = requireDesktopUserDataDir();
  const root = characterRootDir(userData, characterId);
  await ensureDir(root);
  const p = characterSettingsPath(userData, characterId);
  try {
    await fs.stat(p);
    // already exists
    return await loadCharacterSettings(characterId);
  } catch {
    // continue
  }
  const s = defaultCharacterSettings(characterId);
  await fs.writeFile(p, JSON.stringify(s, null, 2) + "\n", "utf8");
  return s;
}

export async function saveCharacterSettings(next: DesktopCharacterSettings) {
  const userData = requireDesktopUserDataDir();
  const root = characterRootDir(userData, next.characterId);
  await ensureDir(root);
  const p = characterSettingsPath(userData, next.characterId);
  const out: DesktopCharacterSettings = {
    ...normalizeCharacterSettings(next, next.characterId),
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(p, JSON.stringify(out, null, 2) + "\n", "utf8");
  return out;
}

export function sanitizeCharacterId(raw: string) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z0-9_\\-]{1,64}$/.test(s)) return null;
  return s;
}

export function safeJoinInside(baseDir: string, relPath: string) {
  const abs = path.resolve(baseDir, relPath);
  const baseAbs = path.resolve(baseDir);
  if (!abs.startsWith(baseAbs + path.sep) && abs !== baseAbs) {
    throw new Error("Path escape detected.");
  }
  return abs;
}
