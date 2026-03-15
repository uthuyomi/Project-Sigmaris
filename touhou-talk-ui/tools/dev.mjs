import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(scriptDir, "../..");

// Load monorepo root env BEFORE starting Next.js so Turbopack/SSR processes inherit it.
loadEnvConfig(repoRoot, true);

function parseEnvFile(p) {
  try {
    const txt = readFileSync(p, "utf8");
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
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
  } catch {
    return null;
  }
}

function applyDesktopEnvFromFile() {
  const envPath = String(process.env.TOUHOU_DESKTOP_ENV_PATH ?? "").trim();
  if (!envPath) return;
  if (!existsSync(envPath)) return;

  const vars = parseEnvFile(envPath);
  if (!vars) return;

  // Safety: never pull service role key from a desktop env file.
  // Desktop dev should work without it, and this avoids accidental privilege escalation.
  delete vars.SUPABASE_SERVICE_ROLE_KEY;

  for (const [k, v] of Object.entries(vars)) {
    if (typeof v !== "string") continue;
    const nextVal = String(v).trim();
    if (!nextVal) continue; // never overwrite with empty
    const cur = typeof process.env[k] === "string" ? String(process.env[k]).trim() : "";
    if (cur) continue; // keep already-provided env (dev runner / shell)
    process.env[k] = nextVal;
  }
}

// If running desktop dev runner, it passes TOUHOU_DESKTOP_ENV_PATH; load it so SSR/API sees SIGMARIS_CORE_URL etc.
applyDesktopEnvFromFile();

// On Windows, spawning `.cmd` directly can fail (EINVAL). Spawn the JS CLI via Node instead.
const nextCli = path.resolve(appDir, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextCli)) {
  console.error(`[dev] next CLI not found: ${nextCli}`);
  process.exit(1);
}

const child = spawn(process.execPath, [nextCli, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: appDir,
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
