const { app, BrowserWindow, shell } = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const isDev = !app.isPackaged;

// Allow dev/pro users to force userData dir (also enables desktop runtime in Next dev).
const requestedUserDataDir = String(process.env.TOUHOU_DESKTOP_USERDATA_DIR ?? "").trim();
if (requestedUserDataDir) {
  try {
    app.setPath("userData", requestedUserDataDir);
  } catch {}
}

function readEnvFile(p) {
  try {
    const txt = fs.readFileSync(p, "utf8");
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

function mergeDefaultsIntoEnvFile(envPath, defaults) {
  if (!defaults) return false;

  const current = readEnvFile(envPath) || {};

  const getOrEmpty = (k) => String(current[k] ?? "").trim();
  const setIfMissing = (k, v) => {
    if (getOrEmpty(k)) return false;
    if (!String(v ?? "").trim()) return false;
    current[k] = String(v).trim();
    return true;
  };
  const setIfEmptyOrTemplateDefault = (k, v, templateDefault) => {
    const cur = getOrEmpty(k);
    if (!cur || cur === String(templateDefault ?? "").trim()) {
      if (!String(v ?? "").trim()) return false;
      current[k] = String(v).trim();
      return true;
    }
    return false;
  };

  let changed = false;

  // Prefer NEXT_PUBLIC_* for browser client; also keep server aliases in sync.
  const url =
    String(defaults.NEXT_PUBLIC_SUPABASE_URL ?? defaults.SUPABASE_URL ?? "").trim();
  const anon =
    String(defaults.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? defaults.SUPABASE_ANON_KEY ?? "").trim();
  const sigmarisCoreUrl =
    String(defaults.SIGMARIS_CORE_URL ?? defaults.NEXT_PUBLIC_SIGMARIS_CORE ?? "").trim();
  const autoBrowseEnabled =
    String(defaults.TOUHOU_AUTO_BROWSE_ENABLED ?? "").trim();
  const uploadEnabled =
    String(defaults.TOUHOU_UPLOAD_ENABLED ?? "").trim();

  changed = setIfMissing("NEXT_PUBLIC_SUPABASE_URL", url) || changed;
  changed = setIfMissing("NEXT_PUBLIC_SUPABASE_ANON_KEY", anon) || changed;
  changed = setIfMissing("SUPABASE_URL", url) || changed;
  changed = setIfMissing("SUPABASE_ANON_KEY", anon) || changed;
  changed =
    setIfEmptyOrTemplateDefault(
      "SIGMARIS_CORE_URL",
      sigmarisCoreUrl,
      "http://127.0.0.1:8000",
    ) || changed;
  changed =
    setIfEmptyOrTemplateDefault(
      "NEXT_PUBLIC_SIGMARIS_CORE",
      sigmarisCoreUrl,
      "",
    ) || changed;
  changed = setIfMissing("TOUHOU_AUTO_BROWSE_ENABLED", autoBrowseEnabled) || changed;
  changed = setIfMissing("TOUHOU_UPLOAD_ENABLED", uploadEnabled) || changed;

  if (!changed) return false;

  const lines = [
    "# Touhou Talk Desktop env (local only)",
    "",
    "# Supabase",
    `NEXT_PUBLIC_SUPABASE_URL=${String(current.NEXT_PUBLIC_SUPABASE_URL ?? "")}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${String(current.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "")}`,
    `SUPABASE_URL=${String(current.SUPABASE_URL ?? "")}`,
    `SUPABASE_ANON_KEY=${String(current.SUPABASE_ANON_KEY ?? "")}`,
    "SUPABASE_SERVICE_ROLE_KEY=",
    "",
    "# Backend Persona OS URL (FastAPI / gensokyo-persona-core)",
    `SIGMARIS_CORE_URL=${String(current.SIGMARIS_CORE_URL ?? "http://127.0.0.1:8000")}`,
    `NEXT_PUBLIC_SIGMARIS_CORE=${String(current.NEXT_PUBLIC_SIGMARIS_CORE ?? "")}`,
    "",
    "# Optional: force port",
    `TOUHOU_DESKTOP_PORT=${String(current.TOUHOU_DESKTOP_PORT ?? "3789")}`,
    "",
  ].join("\n");

  try {
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, lines, "utf8");
    return true;
  } catch {
    return false;
  }
}

function ensureEnvTemplate(envPath) {
  if (fs.existsSync(envPath)) return;
  const tpl = [
    "# Touhou Talk Desktop env (local only)",
    "",
    "# Supabase",
    "NEXT_PUBLIC_SUPABASE_URL=",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "",
    "# Backend Persona OS URL (FastAPI / gensokyo-persona-core)",
    "SIGMARIS_CORE_URL=http://127.0.0.1:8000",
    "",
    "# Optional: force port",
    "TOUHOU_DESKTOP_PORT=3789",
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, tpl, "utf8");
}

function resolveEnvPath() {
  const filename = "touhou-talk.env";

  const candidates = [
    // Standard Electron location (depends on app name / productName)
    path.join(app.getPath("userData"), filename),

    // Common alternatives (older builds / different naming)
    path.join(app.getPath("appData"), "touhou-talk", filename),
    path.join(app.getPath("appData"), "Touhou Talk", filename),
  ];

  // Prefer a file that already contains required keys.
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const vars = readEnvFile(p);
      const url = String(vars?.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
      const anon = String(vars?.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
      if (url && anon) return p;
    } catch {}
  }

  // Otherwise prefer any existing file.
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }

  // Otherwise default to userData (we'll create a template there).
  return candidates[0];
}

function applyEnvFromDisk() {
  const envPath = resolveEnvPath();
  ensureEnvTemplate(envPath);

  process.env.TOUHOU_DESKTOP_ENV_PATH = envPath;
  process.env.TOUHOU_DESKTOP_USERDATA_DIR = app.getPath("userData");

  // Load bundled defaults FIRST and treat them as highest priority.
  // User env file will only fill in missing values (so defaults always win).
  // Safety: never load service role keys from defaults.
  let defaultVars = null;
  try {
    const bundleDefault = path.join(bundleRoot(), "default.env");
    defaultVars = fs.existsSync(bundleDefault) ? readEnvFile(bundleDefault) : null;
  } catch {
    defaultVars = null;
  }

  if (defaultVars) {
    try {
      delete defaultVars.SUPABASE_SERVICE_ROLE_KEY;
    } catch {}

    for (const [k, v] of Object.entries(defaultVars)) {
      const next = String(v ?? "").trim();
      if (!next) continue;
      process.env[k] = next;
    }
  }

  // Still auto-fill the user env template for visibility (but it won't override defaults).
  try {
    mergeDefaultsIntoEnvFile(envPath, defaultVars);
  } catch {}

  const vars = readEnvFile(envPath);
  if (!vars) return;
  for (const [k, v] of Object.entries(vars)) {
    // Do not let user env override bundled defaults.
    if (typeof process.env[k] === "string" && String(process.env[k]).trim() !== "") continue;
    const next = String(v ?? "").trim();
    if (!next) continue;
    process.env[k] = next;
  }
}

function desktopPort() {
  const raw = String(process.env.TOUHOU_DESKTOP_PORT ?? "").trim();
  const n = Number(raw || "3789");
  if (!Number.isFinite(n) || n <= 0) return 3789;
  return Math.min(65535, Math.max(1024, Math.floor(n)));
}

function bundleRoot() {
  if (isDev) {
    // repo-relative: touhou-talk-ui/tools/desktop -> touhou-talk-ui/tools/desktop/.bundle
    return path.resolve(__dirname, ".bundle");
  }
  // packaged: resources/bundle
  return path.join(process.resourcesPath, "bundle");
}

function nextServerCwd() {
  return path.join(bundleRoot(), "next");
}

function nextServerEntry() {
  return path.join(nextServerCwd(), "server.js");
}

let serverProc = null;

async function startNextServer() {
  const entry = nextServerEntry();
  const cwd = nextServerCwd();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Next standalone server not found: ${entry}\nRun: npm run desktop:prepare`
    );
  }

  const port = desktopPort();

  process.env.NODE_ENV = "production";
  process.env.PORT = String(port);

  serverProc = fork(entry, [], {
    cwd,
    env: { ...process.env },
    stdio: "pipe",
  });

  serverProc.on("exit", () => {
    serverProc = null;
  });

  // Wait for server to start (best-effort)
  const url = `http://127.0.0.1:${port}`;
  const started = await waitForHttp(url, 20000);
  if (!started) {
    throw new Error("Next server failed to start within timeout");
  }
  return url;
}

function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const http = require("node:http");
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) return resolve(false);
        setTimeout(tick, 300);
      });
      req.setTimeout(1500, () => {
        req.destroy();
      });
    };
    tick();
  });
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#0b0b12",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const createAvatarWindow = (targetUrl) => {
    const avatarWin = new BrowserWindow({
      width: 420,
      height: 560,
      backgroundColor: "#00000000",
      autoHideMenuBar: true,
      frame: false, // no native title bar / window chrome
      titleBarStyle: "hidden",
      resizable: true,
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      transparent: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    avatarWin.loadURL(targetUrl);
    avatarWin.once("ready-to-show", () => {
      try {
        avatarWin.show();
      } catch {}
    });
  };

  // Intercept window.open from the renderer and create a frameless avatar-only window.
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    try {
      const base = new URL(url);
      const u = new URL(targetUrl, base);

      // External links -> open in default browser.
      if (u.origin !== base.origin) {
        try {
          shell.openExternal(u.toString());
        } catch {}
        return { action: "deny" };
      }

      if (u.pathname === "/desktop/avatar") {
        createAvatarWindow(u.toString());
        return { action: "deny" };
      }

      // Default: allow same-origin windows as-is.
      return { action: "allow" };
    } catch {
      return { action: "deny" };
    }
  });

  win.loadURL(url);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    serverProc?.kill();
  } catch {}
});

app.whenReady().then(async () => {
  applyEnvFromDisk();

  if (isDev) {
    // In dev we just open the normal Next dev server.
    const url = process.env.TOUHOU_DESKTOP_DEV_URL || "http://127.0.0.1:3000";
    createWindow(url);
    return;
  }

  const url = await startNextServer();
  createWindow(url);
});
