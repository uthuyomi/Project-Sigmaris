**Languages:** English | [日本語](README.ja.md)

# Touhou Talk UI

`touhou-talk-ui` is the Next.js frontend in the Project Sigmaris monorepo.
It is an unofficial fan-made character chat product inspired by Touhou Project, designed as a full application rather than a simple chat demo.

## Highlights

- Next.js App Router web application
- Supabase Auth based OAuth login
- Session-based chat persistence
- Map-driven character selection flow
- Themed landing experience with animated presentation
- Optional Electron desktop wrapper
- Per-character VRM / TTS / motion settings

## Stack

- Next.js
- React
- TypeScript
- Supabase
- Tailwind CSS
- three.js / @pixiv/three-vrm
- Electron

## Run locally

### Prerequisites

- Node.js LTS
- npm
- A Supabase project
- A running `gensokyo-persona-core`

Default persona core URL:

- `http://127.0.0.1:8000`

### Environment variables

Configure either:

- `touhou-talk-ui/.env.local`
- the repo root `.env`

Minimum keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SIGMARIS_CORE_URL`
- `NEXT_PUBLIC_SIGMARIS_CORE`

### Start the web app

```bash
cd touhou-talk-ui
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase OAuth redirect URLs

Add URLs such as the following in Supabase Dashboard:

- `http://localhost:3000/auth/callback`
- `http://localhost:3789/auth/callback`
- `https://<your-domain>/auth/callback`

## Main API routes

Chat:

- `GET /api/session`
- `POST /api/session`
- `GET /api/session/[sessionId]/messages`
- `POST /api/session/[sessionId]/message`

Desktop:

- `GET /api/desktop/character-settings`

## Desktop mode

The Electron wrapper runs the same UI as a local desktop app and allows local per-character VRM / TTS / motion configuration.

### Development

```bash
cd touhou-talk-ui
npm run desktop:dev
```

### Distribution build

```bash
cd touhou-talk-ui
npm run desktop:dist
```

## Portfolio value

- Integrates visual design, worldbuilding, and product UX into one frontend
- Handles authentication, persistence, navigation, and chat flow as a full app
- Bridges web and desktop experiences in a single codebase
- Exposes 3D avatar and voice configuration through UI workflows

## Fan work notice

This project is an unofficial, non-commercial fan work inspired by Touhou Project.
It is not affiliated with or endorsed by the original creator or rights holders.
