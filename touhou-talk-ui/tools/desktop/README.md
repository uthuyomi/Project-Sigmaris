# Touhou Talk Desktop (Windows / Electron)

This folder contains the Electron wrapper for `touhou-talk-ui`.

Design goals:

- Desktop mode is local-only (a shell around the UI)
- Desktop runtime stores settings under Electron `userData`
- A bundled `default.env` can ship safe defaults (and is treated as highest priority)

## Prerequisites

- Windows
- Node.js (LTS)

## Run (dev)

From `touhou-talk-ui/`:

```powershell
npm install
npm run desktop:dev
```

What `desktop:dev` does:

- Finds a free Next dev port starting from `3000`
- Starts Next dev via `tools/dev.mjs` (so repo-root `.env` is loaded before SSR/API)
- Starts Electron with `tools/desktop/main.cjs`

## Desktop env file locations

On launch, Electron sets:

- `TOUHOU_DESKTOP_USERDATA_DIR` to the app's `userData` directory
- `TOUHOU_DESKTOP_ENV_PATH` to the env file used by desktop runtime (`touhou-talk.env`)

Typical dev userData dir:

- `%LOCALAPPDATA%/TouhouTalkDesktopDev/` (or `%APPDATA%/...` depending on environment)

The env file is:

- `<userData>/touhou-talk.env`

## Bundled defaults (`default.env`)

Packaged builds can include a bundled `default.env` at:

- `touhou-talk-ui/tools/desktop/.bundle/default.env`

Electron loads bundled defaults first and treats them as highest priority.
The user env file is used only to fill missing values (and will not override defaults).

Security note: service role keys are intentionally not loaded from bundled defaults.

## Supabase redirect URLs

Desktop uses a local port (default `3789`, configurable via `TOUHOU_DESKTOP_PORT`).
Make sure Supabase redirect URLs include:

- `http://localhost:3789/auth/callback`
