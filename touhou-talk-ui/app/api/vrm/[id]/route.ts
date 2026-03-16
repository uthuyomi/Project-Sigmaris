import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  characterRootDir,
  characterVrmPath,
  getDesktopUserDataDir,
  isDesktopRuntimeEnabled,
} from "@/lib/desktop/desktopPaths";
import {
  loadCharacterSettings,
  safeJoinInside,
  sanitizeCharacterId,
} from "@/lib/desktop/desktopSettingsStore";

function safeId(raw: string): string | null {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  if (!/^[a-z0-9_-]+$/i.test(id)) return null;
  return id;
}

function vrmPathForId(id: string) {
  // Avoid `process.cwd()` here: on Vercel it can cause overly-broad output file tracing
  // (pulling large `public/` assets into the function bundle). Keep paths relative.
  return path.join("vrm-characters", `${id}.vrm`);
}

async function resolveVrmFilePath(id: string): Promise<string> {
  if (isDesktopRuntimeEnabled()) {
    const userData = getDesktopUserDataDir();
    const char = sanitizeCharacterId(id);
    if (userData && char) {
      const s = await loadCharacterSettings(char);
      // If desktop runtime is enabled, only serve VRM when explicitly configured.
      // No implicit fallback to bundled VRM for desktop mode.
      if (!s || !s.vrm?.enabled || !s.vrm?.path) {
        throw Object.assign(new Error("VRM disabled"), { code: "DISABLED" });
      }
      const root = characterRootDir(userData, char);
      const rel = String(s.vrm.path).trim();
      const abs = safeJoinInside(root, rel);
      try {
        const st = await fs.stat(abs);
        if (st.isFile()) return abs;
      } catch {
        // If configured but missing on disk, treat as not found.
        throw Object.assign(new Error("VRM missing"), { code: "ENOENT" });
      }
    }
  }
  return vrmPathForId(id);
}

async function unwrapParams(
  ctx: { params: unknown },
): Promise<{ id?: unknown } | null> {
  try {
    const p = (ctx as { params?: unknown } | null)?.params;
    if (!p) return null;
    // Next.js can pass params as a Promise in some runtimes / versions.
    const v = typeof (p as Promise<unknown>)?.then === "function" ? await p : p;
    return (v ?? null) as { id?: unknown } | null;
  } catch {
    return null;
  }
}

export async function HEAD(
  _req: Request,
  ctx: { params: unknown },
) {
  const params = await unwrapParams(ctx);
  const id = safeId(params?.id as string);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const filePath = await resolveVrmFilePath(id);
    const st = await fs.stat(filePath);
    if (!st.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": String(st.size),
        "Cache-Control": "no-store",
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

export async function GET(_req: Request, ctx: { params: unknown }) {
  const params = await unwrapParams(ctx);
  const id = safeId(params?.id as string);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const filePath = await resolveVrmFilePath(id);
    const buf = await fs.readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const errCode = (e as { code?: unknown } | null)?.code;
    if (errCode === "DISABLED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (errCode === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
