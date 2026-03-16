**Languages:** English | [日本語](README.ja.md)

# Touhou Talk UI

`touhou-talk-ui` is a Next.js UI in the Project Sigmaris monorepo.
It is an unofficial fan-made (derivative) character chat UI inspired by Touhou Project, built to stress-test the persona core with a product-shaped UX.

Core dependencies:

- Next.js (App Router)
- Supabase Auth (OAuth) + Postgres persistence (`common_*` tables)
- Persona core proxying to `gensokyo-persona-core` (`/persona/chat`, `/persona/chat/stream`)
- Optional desktop wrapper (Electron, Windows)

## Run locally (web)

### Prerequisites

- Node.js (LTS) + npm
- A Supabase project
- A running `gensokyo-persona-core` (default: `http://127.0.0.1:8000`)

### Env

You can configure env either:

- Standard Next.js way: `touhou-talk-ui/.env.local`, or
- Monorepo way: repo root `.env` (loaded first by `npm run dev` via `tools/dev.mjs`)

Minimum keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `SIGMARIS_CORE_URL` (server-to-server base URL, e.g. `http://127.0.0.1:8000`)
- `NEXT_PUBLIC_SIGMARIS_CORE` (client-visible base URL; usually same as above for local dev)

### Start

```bash
cd touhou-talk-ui
npm install
npm run dev
```

Open: `http://localhost:3000`

## Supabase OAuth redirect URLs

In Supabase Dashboard, add redirect URLs such as:

- `http://localhost:3000/auth/callback` (web dev)
- `http://localhost:3789/auth/callback` (desktop default; see below)
- `https://<your-domain>/auth/callback` (production)

## Internal API routes (Next.js)

Main chat flow:

- `GET /api/session` / `POST /api/session`
- `GET /api/session/[sessionId]/messages`
- `POST /api/session/[sessionId]/message` (supports `?stream=1`)
  - Proxies to the persona core (`/persona/chat` or `/persona/chat/stream`)
  - Persists messages to Supabase (`common_sessions`, `common_messages`)

Desktop-only configuration endpoints:

- `GET /api/desktop/character-settings` (used by the desktop settings UI)

## Desktop (Electron / Windows, optional)

The desktop wrapper is local-only. It runs the UI in an Electron shell and stores per-character config (VRM / TTS / motions) on disk.

### Dev

```bash
cd touhou-talk-ui
npm run desktop:dev
```

`desktop:dev` will:

- Find a free Next dev port starting from `3000`
- Start Next dev (via `tools/dev.mjs`)
- Start Electron (via `tools/desktop/main.cjs`)

### Desktop env file

The dev runner can load a dedicated env file via:

- `TOUHOU_DESKTOP_ENV_PATH` (explicit file path), or
- `%LOCALAPPDATA%/TouhouTalkDesktopDev/touhou-talk.env` / `%APPDATA%/...` (auto location when not set)

It is intended for local dev only. Do not put privileged keys there.

### Packaged build

```bash
cd touhou-talk-ui
npm run desktop:dist
```

## Fan work notice

This project is an unofficial, non-commercial fan work inspired by Touhou Project.
It is not affiliated with or endorsed by the original creator or rights holders.

