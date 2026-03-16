**Languages:** English | [日本語](README.ja.md)

# gensokyo-persona-core

FastAPI backend that implements the "Persona OS" control plane used by UIs in this monorepo.

It exposes:

- Chat: `POST /persona/chat`
- Streaming chat (SSE): `POST /persona/chat/stream`
- External I/O tools (optional, Phase04): web fetch / web RAG / uploads, etc.

This service is consumed by `touhou-talk-ui/` (Next.js route handlers proxy requests to the core).

## Run locally

### Requirements

- Python 3.11+

### Install

```bash
cd gensokyo-persona-core
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
```

### Configure env

For local dev this repo typically uses the repo root `.env` (see `persona_core/storage/env_loader.py`).
Start from `.env.example` at the repo root and set at least:

- `OPENAI_API_KEY`

Optional but common (persistence / auth):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `SIGMARIS_REQUIRE_AUTH=1` (recommended when exposed publicly)

### Start

```bash
./.venv/Scripts/python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Swagger / OpenAPI: `http://127.0.0.1:8000/docs`

## Auth model (important)

The core supports two authentication paths:

1) Supabase JWT (typical for the UI)
   - Provide `Authorization: Bearer <access_token>`
   - The token is verified server-side (best-effort) via Supabase.

2) Internal token bypass (local/dev service-to-service)
   - Set `SIGMARIS_INTERNAL_TOKEN`
   - Send header `X-Sigmaris-Internal-Token: <token>`
   - Requests are treated as `SIGMARIS_DEFAULT_USER_ID` (default: `default-user`)

## API

### `POST /persona/chat`

Minimal request:

```bash
curl -X POST "http://127.0.0.1:8000/persona/chat" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u_test_001","session_id":"s_test_001","message":"Hello. One sentence reply."}'
```

### `POST /persona/chat/stream` (SSE)

```bash
curl -N -X POST "http://127.0.0.1:8000/persona/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u_test_001","session_id":"s_test_001","message":"Hello. Stream your reply."}'
```

Notes:

- If you deploy behind a reverse proxy, ensure SSE buffering is disabled.
- UIs in this repo proxy this endpoint from Next.js route handlers.

## Web fetch / Web RAG (optional, Phase04)

The core includes SSRF-guarded web fetching and a bounded "web RAG" pipeline.

### Web fetch allowlist

Fetching is blocked unless you explicitly allow it:

- `SIGMARIS_WEB_FETCH_ALLOW_DOMAINS` - comma-separated domains (e.g. `wikipedia.org, nhk.or.jp`)
- `SIGMARIS_WEB_FETCH_ALLOW_ALL=1` - development only

### Web RAG toggles

- `SIGMARIS_WEB_RAG_ENABLED=1` - enable `/io/web/rag`
- `SIGMARIS_WEB_RAG_AUTO=1` - optional auto-trigger (best-effort)

Search providers (optional):

- `SERPER_API_KEY` - Serper

## Where to look in code (orientation)

- API server: `persona_core/server_persona_os.py`
- External I/O: `persona_core/phase04/io/`
- Memory + stores: `persona_core/memory/`, `persona_core/storage/`
- Safety: `persona_core/safety/`
- State machine: `persona_core/state/`

