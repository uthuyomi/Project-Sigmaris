# Touhou Talk Desktop (Windows)

This is a **local-only** desktop wrapper for `touhou-talk-ui` using Electron.

## Prerequisites

- Windows
- Node.js (LTS)

## Setup

1. Install deps:

   - `cd touhou-talk-ui`
   - `npm install`

2. Build the Next.js standalone bundle:

   - `npm run desktop:prepare`

3. Configure env for the desktop app:

   - Launch the desktop app once (it will create a file):
     - `%APPDATA%/Touhou Talk/touhou-talk.env`
    - Fill in at least:
      - `NEXT_PUBLIC_SUPABASE_URL`
      - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      - `SUPABASE_SERVICE_ROLE_KEY`
      - `SIGMARIS_CORE_URL`

4. Make sure Supabase redirect URLs include:

   - `http://localhost:3789/auth/callback`

   (Change the port if you set `TOUHOU_DESKTOP_PORT`.)

## Run

- Dev (uses existing `next dev`):
  - Start Next dev server: `npm run dev:raw`
  - Start Electron: `npm run desktop:dev`

- Packaged app:
  - `npm run desktop:dist`

## Notes
