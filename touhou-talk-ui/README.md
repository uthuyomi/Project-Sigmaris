**Languages:** English | [日本語](README.ja.md)

# Touhou Talk UI

This directory contains an **unofficial fan-made** (derivative) character chat UI inspired by **Touhou Project**.

It is a UI variant in **Project Sigmaris** and uses:

- **Supabase Auth** (OAuth) for login
- **Supabase DB** for session/message persistence
- **Sigmaris Persona OS backend** (`sigmaris_core`) for response generation (`/persona/chat`, `/persona/chat/stream`)

## What’s in here

- Next.js App Router UI (`/entry`, `/chat/session`, `/auth/*`)
- Session-based chat persistence in Supabase (`common_sessions`, `common_messages`)
- Server-side API routes that proxy to `sigmaris_core` and optionally enrich messages (uploads / link analysis / web tools)
- Optional PWA manifest (`public/site.webmanifest`) and service worker registration (`/sw.js`)
- Optional Windows desktop packaging (Electron)

## Requirements

- Node.js + npm
- A Supabase project (URL / anon key / service role key)
- A running `sigmaris_core` backend (default: `http://127.0.0.1:8000`)

## Environment variables

Create `touhou-talk-ui/.env.local` (or use the repo root `.env` in this monorepo).

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `SIGMARIS_CORE_URL` (e.g. `http://127.0.0.1:8000`)

Recommended (ops / hardening):

- `NEXT_PUBLIC_SITE_URL` (used for metadata, sitemap, robots; falls back to `VERCEL_URL` or `http://localhost:3000`)
- `TOUHOU_ALLOWED_ORIGINS` (comma-separated; defaults to same-origin when unset)
- `TOUHOU_RATE_LIMIT_MS` (best-effort per-user minimum interval; default `1200`)

Optional (Phase04 features for `/api/session/[sessionId]/message`):

- `TOUHOU_UPLOAD_ENABLED` (`0/1`) → enable file upload + parse via `sigmaris_core` (`/io/upload`, `/io/parse`)
- `TOUHOU_LINK_ANALYSIS_ENABLED` (`0/1`) → enable link analysis via `sigmaris_core` (`/io/web/fetch`, `/io/web/search`, `/io/github/repos`)
- `TOUHOU_AUTO_BROWSE_ENABLED` (`0/1`) → enable auto browse (best-effort) when link analysis is disabled

## Run locally

From this repository root:

```bash
cd touhou-talk-ui
npm install
npm run dev
```

Then open `http://localhost:3000`.

Notes:

- `npm run dev` loads environment variables from the **repo root** first (monorepo convenience), then Next.js loads `touhou-talk-ui/.env*` files.
- The main chat route is `GET /chat/session` (and `/chat` redirects there).

## Auth / OAuth

- Login page: `GET /auth/login`
- OAuth callback: `GET /auth/callback` (server-side code exchange via Supabase)

In Supabase Dashboard, enable OAuth providers you want (the UI offers Google/GitHub/Discord by default) and add redirect URLs, e.g.:

- `http://localhost:3000/auth/callback`
- `https://<your-domain>/auth/callback`

## Persistence model (Supabase)

This UI stores data under `app = "touhou"` and uses:

- `common_sessions` (chat sessions)
- `common_messages` (chat messages)
- `common_state_snapshots` (optional; stores core meta snapshots when available)

## Internal API routes (Next.js)

Main (used by `/chat/session`):

- `GET /api/session` (list sessions; requires auth)
- `POST /api/session` (create a session; requires auth)
- `GET /api/session/[sessionId]/messages` (reload/restore; requires auth)
- `POST /api/session/[sessionId]/message` (send a message; requires auth)
  - Content-Type: `multipart/form-data`
  - Proxies to `sigmaris_core` (`/persona/chat` or `/persona/chat/stream`)
  - Injects character persona via `persona_system` (built in `lib/touhouPersona.ts`)

Other:

- `GET /api/io/attachment/[attachmentId]` (proxy to `sigmaris_core` attachment download)
- `POST /api/chat` (legacy; used by older components in this repo)

## Desktop build (Windows, optional)

```bash
cd touhou-talk-ui
npm run desktop:dist
```

## Fan work notice

This project is an **unofficial, non-commercial fan work** based on Touhou Project.

It is **not affiliated with or endorsed by** the original creator or rights holder.

Touhou-related characters, names, and settings are the property of:

- Team Shanghai Alice (上海アリス幻樂団)

## License

This directory does not include a dedicated license file.

Please follow the license policy of the repository and/or sibling packages (for example: `sigmaris-os/LICENSE`).
