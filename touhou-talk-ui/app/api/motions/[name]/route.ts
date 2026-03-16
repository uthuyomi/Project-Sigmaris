import { NextResponse } from "next/server";
import path from "node:path";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
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

async function unwrapParams(
  ctx: { params: unknown },
): Promise<{ name?: unknown } | null> {
  try {
    const p = (ctx as { params?: unknown } | null)?.params;
    if (!p) return null;
    const v = typeof (p as Promise<unknown>)?.then === "function" ? await p : p;
    return (v ?? null) as { name?: unknown } | null;
  } catch {
    return null;
  }
}

async function resolveMotionContext(req: Request): Promise<{
  rootDir: string;
  motionsJsonAbs: string;
}> {
  const u = new URL(req.url);
  const char = sanitizeCharacterId(u.searchParams.get("char") ?? "");
  if (char && isDesktopRuntimeEnabled()) {
    const userData = getDesktopUserDataDir();
    if (userData) {
      const s = await loadCharacterSettings(char);
      const root = characterRootDir(userData, char);
      const rel = typeof s?.motions?.indexPath === "string" && s.motions.indexPath ? s.motions.indexPath : null;
      const motionsJsonAbs = rel
        ? safeJoinInside(root, rel)
        : path.join(characterMotionLibraryDir(userData, char), "motions.json");
      return { rootDir: path.dirname(motionsJsonAbs), motionsJsonAbs };
    }
  }
  return { rootDir: motionLibraryRoot(), motionsJsonAbs: motionsJsonPath() };
}

async function resolvePathByNameWithIndex(name: string, motionsJsonAbs: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(motionsJsonAbs, "utf8");
    const parsed = JSON.parse(raw) as { motions?: unknown };
    const arr = Array.isArray(parsed?.motions) ? (parsed.motions as unknown[]) : [];
    for (const m of arr) {
      const obj = (m ?? null) as { name?: unknown; path?: unknown } | null;
      const n = safeName(obj?.name as string);
      const p = typeof obj?.path === "string" ? obj.path : "";
      if (n === name && p) return p;
    }
  } catch {
    // ignore
  }
  return path.posix.join("converted", "glb", `${name}.glb`);
}

export async function GET(req: Request, ctx: { params: unknown }) {
  const params = await unwrapParams(ctx);
  const name = safeName(params?.name as string);
  if (!name) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const motionCtx = await resolveMotionContext(req);
  const root = motionCtx.rootDir;
  const rel = await resolvePathByNameWithIndex(name, motionCtx.motionsJsonAbs);
  if (!rel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root) + path.sep)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Use weak ETag so browser/GLTFLoader can avoid re-downloading unchanged motions.
    const etag = `W/\"${String(st.size)}-${String(Math.floor(Number(st.mtimeMs) || 0))}\"`;
    const inm = req.headers.get("if-none-match") ?? "";
    if (inm && inm === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }

    // Stream the file to avoid buffering large GLBs into Node's memory (prevents OOM crashes).
    const nodeStream = createReadStream(abs);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(webStream as any, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": String(st.size),
        "Last-Modified": new Date(st.mtimeMs).toUTCString(),
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
