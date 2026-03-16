import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  characterMotionLibraryDir,
  characterRootDir,
  getDesktopUserDataDir,
  isDesktopRuntimeEnabled,
} from "@/lib/desktop/desktopPaths";
import {
  loadCharacterSettings,
  safeJoinInside,
  sanitizeCharacterId,
} from "@/lib/desktop/desktopSettingsStore";

export const runtime = "nodejs";

type MotionKind = "idle" | "talk" | "gesture";

type MotionEntry = {
  name: string;
  kind: MotionKind;
  path: string;
  source?: string;
};

function safeName(raw: unknown): string | null {
  const name = String(raw ?? "").trim();
  if (!name) return null;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) return null;
  return name;
}

function motionLibraryRoot() {
  // Avoid `process.cwd()` here: on Vercel it can cause overly-broad output file tracing.
  return path.join("vrm-characters", "motion-library");
}

function motionsJsonPath() {
  return path.join(motionLibraryRoot(), "motions.json");
}

function convertedGlbRoot() {
  return path.join(motionLibraryRoot(), "converted", "glb");
}

function kindFromFilename(baseName: string): MotionKind {
  const s = baseName.toLowerCase();
  if (s.startsWith("idle")) return "idle";
  if (s.startsWith("talk")) return "talk";
  return "gesture";
}

async function resolveMotionContext(req: Request): Promise<{
  rootDir: string;
  motionsJsonAbs: string;
  urlQuery: string;
  allowFallbackScan: boolean;
  disabled: boolean;
}> {
  const u = new URL(req.url);
  const char = sanitizeCharacterId(u.searchParams.get("char") ?? "");

  if (char && isDesktopRuntimeEnabled()) {
    const userData = getDesktopUserDataDir();
    if (userData) {
      const s = await loadCharacterSettings(char);
      if (s?.motions?.enabled === false) {
        // Explicitly disabled for this character => empty list.
        return {
          rootDir: characterMotionLibraryDir(userData, char),
          motionsJsonAbs: path.join(characterMotionLibraryDir(userData, char), "motions.json"),
          urlQuery: `?char=${encodeURIComponent(char)}`,
          allowFallbackScan: false,
          disabled: true,
        };
      }

      const root = characterRootDir(userData, char);
      const rel = typeof s?.motions?.indexPath === "string" && s.motions.indexPath ? s.motions.indexPath : null;
      const motionsJsonAbs = rel ? safeJoinInside(root, rel) : path.join(characterMotionLibraryDir(userData, char), "motions.json");
      return {
        rootDir: path.dirname(motionsJsonAbs),
        motionsJsonAbs,
        urlQuery: `?char=${encodeURIComponent(char)}`,
        allowFallbackScan: true,
        disabled: false,
      };
    }
  }

  return {
    rootDir: motionLibraryRoot(),
    motionsJsonAbs: motionsJsonPath(),
    urlQuery: "",
    allowFallbackScan: true,
    disabled: false,
  };
}

export async function GET(req: Request) {
  const ctx = await resolveMotionContext(req);
  const root = ctx.rootDir;

  if (ctx.disabled) {
    return NextResponse.json(
      { version: 1, motions: [] },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  let motions: MotionEntry[] = [];
  try {
    const raw = await fs.readFile(ctx.motionsJsonAbs, "utf8");
    const parsed = JSON.parse(raw) as { motions?: unknown };
    const arr = Array.isArray(parsed?.motions) ? (parsed.motions as unknown[]) : [];
    motions = arr
      .map((m): MotionEntry | null => {
        const obj = (m ?? null) as Partial<MotionEntry> | null;
        const name = safeName(obj?.name);
        const kind =
          obj?.kind === "idle" || obj?.kind === "talk" || obj?.kind === "gesture"
            ? obj.kind
            : null;
        const p = typeof obj?.path === "string" ? obj.path : "";
        if (!name || !kind || !p) return null;
        return { name, kind, path: p, source: typeof obj?.source === "string" ? obj.source : undefined };
      })
      .filter((v): v is MotionEntry => !!v);
  } catch {
    motions = [];
  }

  // Fallback: if motions.json is empty/missing, auto-discover converted/glb/*.glb.
  if (ctx.allowFallbackScan && motions.length === 0) {
    try {
      const scanDir = path.join(root, "converted", "glb");
      const files = await fs.readdir(scanDir, { withFileTypes: true });
      motions = files
        .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".glb"))
        .map((d) => {
          const base = d.name.replace(/\.glb$/i, "");
          const name = safeName(base) ?? base.replace(/[^a-z0-9._-]/gi, "_");
          return {
            name,
            kind: kindFromFilename(name),
            path: path.posix.join("converted", "glb", d.name),
            source: "local",
          };
        });
    } catch {
      motions = [];
    }
  }

  // Validate that referenced files stay inside the motion-library root and exist.
  const visible: Array<{ name: string; kind: MotionKind; url: string; source?: string }> = [];
  for (const m of motions) {
      try {
        const abs = path.resolve(root, m.path);
        if (!abs.startsWith(path.resolve(root) + path.sep)) continue;
        const st = await fs.stat(abs);
        if (!st.isFile()) continue;
        visible.push({
          name: m.name,
          kind: m.kind,
          url: `/api/motions/${encodeURIComponent(m.name)}${ctx.urlQuery}`,
          source: m.source,
        });
      } catch {
        // ignore missing
      }
  }

  return NextResponse.json(
    {
      version: 1,
      motions: visible,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
