const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

async function rmrf(p) {
  await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
}

async function copyDir(src, dst) {
  await fsp.mkdir(dst, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (e) => {
      const s = path.join(src, e.name);
      const d = path.join(dst, e.name);
      if (e.isDirectory()) return copyDir(s, d);
      if (e.isSymbolicLink()) return;
      await fsp.copyFile(s, d);
    })
  );
}

function parseEnvText(txt) {
  const out = {};
  for (const line of String(txt ?? "").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i <= 0) continue;
    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

function scrubSecretEnvKeys(txt) {
  const lines = String(txt ?? "").split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
        return "SUPABASE_SERVICE_ROLE_KEY=";
      }
      return line;
    })
    .join("\n");
}

async function writeDefaultEnv(bundleRoot, repoRoot) {
  // If a tracked default.env exists, prefer it (end-user friendly and reproducible).
  // We still scrub secrets like SUPABASE_SERVICE_ROLE_KEY to avoid accidental leakage.
  const trackedDefaultEnvPath = path.join(__dirname, "default.env");
  if (fs.existsSync(trackedDefaultEnvPath)) {
    const rawTracked = await fsp.readFile(trackedDefaultEnvPath, "utf8").catch(() => "");
    if (rawTracked.trim()) {
      await fsp.mkdir(bundleRoot, { recursive: true });
      await fsp.writeFile(
        path.join(bundleRoot, "default.env"),
        scrubSecretEnvKeys(rawTracked),
        "utf8",
      );
      return true;
    }
  }

  // Extract only public Supabase values from repo root `.env` and embed into the desktop bundle.
  // NOTE: Do NOT embed SUPABASE_SERVICE_ROLE_KEY or any other secrets.
  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) return false;

  const raw = await fsp.readFile(envPath, "utf8").catch(() => "");
  const vars = parseEnvText(raw);

  const url =
    String(vars.NEXT_PUBLIC_SUPABASE_URL ?? vars.SUPABASE_URL ?? "").trim();
  const anon =
    String(vars.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? vars.SUPABASE_ANON_KEY ?? "").trim();

  if (!url || !anon) return false;

  // Desktop default should point to the hosted backend by default (end-user friendly).
  // Allow overriding via repo `.env` for builds, and via `touhou-talk.env` at runtime.
  const sigmarisCoreFromRepo = String(
    vars.SIGMARIS_CORE_URL ?? vars.NEXT_PUBLIC_SIGMARIS_CORE ?? "",
  ).trim();
  const sigmarisCoreUrl =
    sigmarisCoreFromRepo &&
    !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i.test(sigmarisCoreFromRepo)
      ? sigmarisCoreFromRepo
      : "https://project-sigmaris.fly.dev/";

  // Feature flags (optional)
  const autoBrowseEnabled = String(vars.TOUHOU_AUTO_BROWSE_ENABLED ?? "").trim();
  const uploadEnabled = String(vars.TOUHOU_UPLOAD_ENABLED ?? "").trim();

  const out = [
    "# Desktop default env (generated at build time)",
    "# Contains only public config that may be shipped with the app.",
    "",
    "# Feature flags (optional)",
    `TOUHOU_AUTO_BROWSE_ENABLED=${autoBrowseEnabled}`,
    `TOUHOU_UPLOAD_ENABLED=${uploadEnabled}`,
    "",
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    "",
    "# Non-public-key aliases (middleware/server code may read these)",
    `SUPABASE_URL=${url}`,
    `SUPABASE_ANON_KEY=${anon}`,
    "",
    "# DO NOT SHIP service role keys in desktop defaults.",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "",
    "# Backend Persona OS URL (public)",
    `SIGMARIS_CORE_URL=${sigmarisCoreUrl}`,
    `NEXT_PUBLIC_SIGMARIS_CORE=${sigmarisCoreUrl}`,
    "",
  ].join("\n");

  await fsp.mkdir(bundleRoot, { recursive: true });
  await fsp.writeFile(path.join(bundleRoot, "default.env"), out, "utf8");
  return true;
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const repoRoot = path.resolve(projectRoot, "..");
  const bundleRoot = path.resolve(__dirname, ".bundle");
  const outNext = path.join(bundleRoot, "next");

  const standaloneDir = path.join(projectRoot, ".next", "standalone");
  const staticDir = path.join(projectRoot, ".next", "static");
  const publicDir = path.join(projectRoot, "public");

  if (!fs.existsSync(standaloneDir)) {
    throw new Error("Missing .next/standalone. Run `next build` first.");
  }

  await rmrf(bundleRoot);
  await fsp.mkdir(bundleRoot, { recursive: true });

  // Copy standalone server (contains server.js and required node_modules)
  await copyDir(standaloneDir, outNext);

  // Next standalone expects `.next/static` alongside server.js
  await copyDir(staticDir, path.join(outNext, ".next", "static"));

  // And `public/` alongside server.js
  await copyDir(publicDir, path.join(outNext, "public"));

  // Desktop-only helpers (keep this minimal; do not copy the whole repo)
  // - AquesTalk synth helper script used by `/api/tts/aquestalk1`
  const toolsDir = path.join(projectRoot, "tools");
  const aqScript = path.join(toolsDir, "aquestalk1-synth.ps1");
  if (fs.existsSync(aqScript)) {
    await fsp.mkdir(path.join(outNext, "tools"), { recursive: true });
    await fsp.copyFile(aqScript, path.join(outNext, "tools", "aquestalk1-synth.ps1"));
  }

  const ok = await writeDefaultEnv(bundleRoot, repoRoot);
  if (!ok) {
    console.warn(
      "[desktop] default.env not generated (repo .env missing or SUPABASE keys missing). Desktop login may require manual env.",
    );
  } else {
    console.log("[desktop] default.env generated");
  }

  console.log(`[desktop] bundle ready: ${bundleRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
