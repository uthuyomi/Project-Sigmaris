import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { parseGlbJson } from "@/lib/vrm/parse-glb";
import { scanVrmGltfJson, type VrmScanResult } from "@/lib/vrm/scan-vrm";
import {
  characterRootDir,
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

async function unwrapParams(
  ctx: { params: unknown },
): Promise<{ id?: unknown } | null> {
  try {
    const p = (ctx as { params?: unknown } | null)?.params;
    if (!p) return null;
    const v = typeof (p as any)?.then === "function" ? await (p as any) : p;
    return (v ?? null) as { id?: unknown } | null;
  } catch {
    return null;
  }
}

function vrmPathForId(id: string) {
  // Avoid `process.cwd()` here: on Vercel it can cause overly-broad output file tracing.
  return path.join("vrm-characters", `${id}.vrm`);
}

function scanPathForId(id: string) {
  if (isDesktopRuntimeEnabled()) {
    const userData = getDesktopUserDataDir();
    const char = sanitizeCharacterId(id);
    if (userData && char) {
      return path.join(characterRootDir(userData, char), "scan.json");
    }
  }
  return path.join("vrm-characters", `${id}.scan.json`);
}

async function resolveVrmPathForId(id: string) {
  if (!isDesktopRuntimeEnabled()) return vrmPathForId(id);
  const userData = getDesktopUserDataDir();
  const char = sanitizeCharacterId(id);
  if (!userData || !char) return vrmPathForId(id);

  const s = await loadCharacterSettings(char);
  if (s?.vrm?.enabled === false) {
    throw Object.assign(new Error("VRM disabled"), { code: "DISABLED" });
  }
  const root = characterRootDir(userData, char);
  const rel = typeof s?.vrm?.path === "string" && s.vrm.path ? s.vrm.path : "avatar.vrm";
  const abs = safeJoinInside(root, rel);
  try {
    const st = await fs.stat(abs);
    if (st.isFile()) return abs;
  } catch {
    // ignore
  }
  return vrmPathForId(id);
}

async function readVrmAndScan(id: string): Promise<VrmScanResult> {
  const buf = await fs.readFile(await resolveVrmPathForId(id));
  const json = parseGlbJson(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  return scanVrmGltfJson(id, json);
}

export async function GET(_req: Request, ctx: { params: unknown }) {
  const params = await unwrapParams(ctx);
  const id = safeId(params?.id as string);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const p = scanPathForId(id);
  try {
    const raw = await fs.readFile(p, "utf8");
    return NextResponse.json(JSON.parse(raw), { status: 200 });
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === "DISABLED") {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    if (code === "ENOENT") {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(_req: Request, ctx: { params: unknown }) {
  const params = await unwrapParams(ctx);
  const id = safeId(params?.id as string);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const scan = await readVrmAndScan(id);
    const outPath = scanPathForId(id);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(scan, null, 2) + "\n", "utf8");
    console.log("[/api/vrm/:id/scan] saved:", outPath);
    return NextResponse.json(
      {
        ok: true,
        saved: path.basename(outPath),
        savedPath: outPath,
        nodeCount: scan.gltf.nodeCount,
      },
      { status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
