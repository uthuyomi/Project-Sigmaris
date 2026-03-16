import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { isDesktopRuntimeEnabled } from "@/lib/desktop/desktopPaths";
import { loadCharacterSettings, sanitizeCharacterId } from "@/lib/desktop/desktopSettingsStore";

export const runtime = "nodejs";

type ReqBody = {
  text?: string;
  speed?: number;
  voice?: string;
};

function stripBomTrim(s: string) {
  return s.replace(/^\uFEFF/, "").trim();
}

function normalizeBase64(s: string) {
  return s
    .replace(/[\r\n\s]+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
}

function isValidBase64Payload(b64: string) {
  const s = normalizeBase64(b64);
  if (!s) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return false;
  // Most base64 payloads are padded to a 4-char boundary; if not, it's usually broken.
  if (s.length % 4 !== 0) return false;
  return true;
}

function parseSynthStdout(buf: Buffer): { b64: string; koe: string | null; raw: string } {
  const candidates: Array<{ enc: BufferEncoding; text: string }> = [
    { enc: "utf8", text: stripBomTrim(buf.toString("utf8")) },
    { enc: "utf16le", text: stripBomTrim(buf.toString("utf16le")) },
  ];

  for (const c of candidates) {
    const raw = c.text;
    if (!raw) continue;

    // 1) JSON output (current script)
    try {
      const j = JSON.parse(raw) as { b64?: unknown; koe?: unknown };
      const b64 = typeof j?.b64 === "string" ? normalizeBase64(j.b64) : null;
      const koe = typeof j?.koe === "string" ? j.koe : null;
      if (b64 && isValidBase64Payload(b64)) return { b64, koe, raw };
    } catch {
      // ignore
    }

    // 2) Backward-compat: base64 only
    const b64Only = normalizeBase64(raw);
    if (isValidBase64Payload(b64Only)) return { b64: b64Only, koe: null, raw };
  }

  // Last resort: heuristic UTF-16LE detection (PowerShell sometimes pipes UTF-16 without BOM)
  let nulCount = 0;
  for (let i = 0; i < buf.length; i += 1) if (buf[i] === 0) nulCount += 1;
  const looksUtf16 = buf.length >= 2 && nulCount / buf.length > 0.15;
  if (looksUtf16) {
    const raw = stripBomTrim(buf.toString("utf16le"));
    try {
      const j = JSON.parse(raw) as { b64?: unknown; koe?: unknown };
      const b64 = typeof j?.b64 === "string" ? normalizeBase64(j.b64) : null;
      const koe = typeof j?.koe === "string" ? j.koe : null;
      if (b64 && isValidBase64Payload(b64)) return { b64, koe, raw };
    } catch {
      // ignore
    }
    const b64Only = normalizeBase64(raw);
    if (isValidBase64Payload(b64Only)) return { b64: b64Only, koe: null, raw };
  }

  const sampleUtf8 = stripBomTrim(buf.toString("utf8")).slice(0, 200);
  const sampleUtf16 = stripBomTrim(buf.toString("utf16le")).slice(0, 200);
  throw new Error(
    `Unable to parse AquesTalk1 stdout (invalid JSON/base64). utf8="${sampleUtf8}" utf16le="${sampleUtf16}"`,
  );
}

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function safeVoice(v: string | undefined) {
  const s = String(v ?? "f1").trim().toLowerCase();
  const allowed = new Set([
    "f1",
    "f2",
    "f3",
    "m1",
    "r1",
    "jgr",
    "imd1",
    "dvd",
  ]);
  return allowed.has(s) ? s : "f1";
}

export async function POST(req: Request) {
  if (process.platform !== "win32") {
    return NextResponse.json(
      { error: "AquesTalk1 backend is only supported on Windows dev for now." },
      { status: 501 },
    );
  }

  const body = (await req.json().catch(() => null)) as ReqBody | null;
  const text = String(body?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

  const u = new URL(req.url);
  const char = sanitizeCharacterId(u.searchParams.get("char") ?? "");

  let speedSrc: number | undefined = typeof body?.speed === "number" ? body.speed : undefined;
  let voiceSrc: string | undefined = typeof body?.voice === "string" ? body.voice : undefined;
  let aqRootOverride: string | null = null;

  if (char && isDesktopRuntimeEnabled()) {
    try {
      const s = await loadCharacterSettings(char);
      if (s?.tts?.mode === "aquestalk" && s.tts.aquestalk?.enabled) {
        if (speedSrc == null) speedSrc = Number(s.tts.aquestalk.speed);
        if (voiceSrc == null) voiceSrc = String(s.tts.aquestalk.voice ?? "");
      }
      if (typeof s?.tts?.aquestalk?.rootDir === "string" && s.tts.aquestalk.rootDir.trim()) {
        aqRootOverride = s.tts.aquestalk.rootDir.trim();
      }
    } catch {
      // ignore
    }
  }

  const speed = clampInt(Number(speedSrc ?? 120), 50, 300);
  const voice = safeVoice(voiceSrc);

  // Repo layout assumption:
  //   Project-Sigmaris/
  //     aquestalk/
  //     touhou-talk-ui/  (this app)
  // Avoid `process.cwd()` here: on Vercel it can cause overly-broad output file tracing.
  // In local dev, Next is started from `touhou-talk-ui/`, so `..` points to the monorepo root.
  const aqRoot = aqRootOverride ?? path.join("..", "aquestalk");

  const aqtk1 = path.join(aqRoot, "aqtk1_win_200", "aqtk1_win");
  const aqtk1DllDir = path.join(aqtk1, "lib64", voice);
  const aqk2k = path.join(aqRoot, "aqk2k_win_413", "aqk2k_win");
  const aqk2kDllDir = path.join(aqk2k, "lib64");
  const aqk2kDicDir = path.join(aqk2k, "aq_dic");

  const ps = path.join(
    process.env.WINDIR ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );

  const scriptPath = path.join("tools", "aquestalk1-synth.ps1");

  const child = spawn(
    ps,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-Text",
      text,
      "-Speed",
      String(speed),
      "-Aqtk1DllDir",
      aqtk1DllDir,
      "-Aqk2kDllDir",
      aqk2kDllDir,
      "-Aqk2kDicDir",
      aqk2kDicDir,
    ],
    { windowsHide: true },
  );

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (d) => stdout.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
  child.stderr.on("data", (d) => stderr.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));

  const code: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (c) => resolve(c ?? 0));
  });

  if (code !== 0) {
    const errText = Buffer.concat(stderr).toString("utf-8").trim();
    const outText = stripBomTrim(Buffer.concat(stdout).toString("utf8"));
    return NextResponse.json(
      {
        error: errText || `powershell exit ${code}`,
        stdout: outText || null,
        meta: {
          voice,
          speed,
          aqtk1DllDir,
          aqk2kDllDir,
          aqk2kDicDir,
        },
      },
      { status: 500 },
    );
  }

  let parsed: { b64: string; koe: string | null; raw: string };
  try {
    parsed = parseSynthStdout(Buffer.concat(stdout));
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Invalid synthesizer output";
    return NextResponse.json(
      { error: reason, meta: { voice, speed } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const b64 = parsed.b64;
  const koe = parsed.koe;

  const wantsJson =
    (req.headers.get("accept") ?? "").includes("application/json") ||
    (new URL(req.url).searchParams.get("format") ?? "") === "json";

  if (wantsJson) {
    return NextResponse.json(
      {
        b64,
        koe,
        meta: { voice, speed },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  let wav: Buffer;
  try {
    // NOTE: Buffer.from(base64) is permissive; validate before decoding to avoid silent corruption.
    if (!isValidBase64Payload(b64)) throw new Error("Invalid base64");
    wav = Buffer.from(normalizeBase64(b64), "base64");
  } catch {
    return NextResponse.json({ error: "Invalid base64 audio payload" }, { status: 500 });
  }

  return new NextResponse(wav, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
