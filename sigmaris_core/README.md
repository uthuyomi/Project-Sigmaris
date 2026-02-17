**Languages:** English | [日本語](README.ja.md)

# sigmaris-core (Sigmaris Persona OS Engine)

`sigmaris-core` is the **backend engine** of Project Sigmaris.

It exposes a small HTTP API (FastAPI) and implements the “Persona OS” control plane:

- Memory selection / reinjection
- Identity continuity
- Value / trait drift tracking
- Dialogue state routing (Phase03)
- Safety / guardrails
- Observability (`trace_id` + structured `meta`)

This engine is consumed by:

- `sigmaris-os/` (reference UI)
- `touhou-talk-ui/` (variant UI)

---

## API

- `POST /persona/chat` → `{ reply, meta }`
- `POST /persona/chat/stream` → SSE (`start` / `delta` / `done`)


- `POST /io/web/search` — web search (Serper)
- `POST /io/web/fetch` — fetch + (optional) summarize (allowlist/SSRF-guarded)
- `POST /io/web/rag` — search → bounded crawl → extract → rank → context (optional)

Swagger:

- `http://127.0.0.1:8000/docs`

### Minimal request

```bash
curl -X POST "http://127.0.0.1:8000/persona/chat" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u_test_001","session_id":"s_test_001","message":"Hello. One sentence reply."}'
```

### Streaming (SSE)

```bash
curl -N -X POST "http://127.0.0.1:8000/persona/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u_test_001","session_id":"s_test_001","message":"Hello. Stream your reply."}'
```

---

## Web RAG (optional)

sigmaris-core can optionally enrich replies with **external web context** when it is explicitly requested or when time-sensitive hints are detected (configurable).

### Required (search provider)

- `SERPER_API_KEY` (Serper)

### Required (safety)

Fetching is blocked unless you set an allowlist:

- `SIGMARIS_WEB_FETCH_ALLOW_DOMAINS` (comma-separated, e.g. `wikipedia.org, dic.nicovideo.jp, w.atwiki.jp, touhouwiki.net`)

### Enable

- `SIGMARIS_WEB_RAG_ENABLED=1` (enable `/io/web/rag` and prompt injection)
- `SIGMARIS_WEB_RAG_AUTO=1` (optional: auto-trigger on time-sensitive hints)

### Tuning / policy

- `SIGMARIS_WEB_RAG_ALLOW_DOMAINS` / `SIGMARIS_WEB_RAG_DENY_DOMAINS` (additional allow/deny filters)
- `SIGMARIS_WEB_RAG_MAX_PAGES` (default `20`)
- `SIGMARIS_WEB_RAG_MAX_DEPTH` (default `1`)
- `SIGMARIS_WEB_RAG_TOP_K` (default `6`)
- `SIGMARIS_WEB_RAG_CRAWL_CROSS_DOMAIN=1` (default off; only crawl within the same host)
- `SIGMARIS_WEB_RAG_LINKS_PER_PAGE` (default `120`)
- `SIGMARIS_WEB_RAG_RECENCY_DAYS` (default `14` for time-sensitive turns)

### Optional summarization (copyright-safe paraphrase)

If enabled, each fetched page is summarized with a small model (paraphrase-only; avoids long quotes):

- `SIGMARIS_WEB_FETCH_SUMMARIZE=1`
- `SIGMARIS_WEB_FETCH_SUMMARY_MODEL` (default `gpt-5-mini`)
- `SIGMARIS_WEB_FETCH_SUMMARY_TIMEOUT_SEC` (default `60`)

### Copyright / ToS guidance

- The core is instructed to **paraphrase** and avoid long verbatim quotes.
- When a claim is based on web context, replies should include **source URLs**.

---

## Quickstart (local)

### Requirements

- Python 3.11+ recommended

### 1) Install

```bash
pip install -r sigmaris_core/requirements.txt
```

### 2) Configure env

Minimum:

- `OPENAI_API_KEY`

Optional (persistence / uploads / storage integration):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3) Run

```bash
python -m uvicorn sigmaris_core.server:app --reload --port 8000
```

---

## “Natural dialogue” control (v1)

To reduce “interview / over-structured” replies **for all UIs** (not UI-specific), the core includes a lightweight controller that:

- Keeps a small set of **style/turn-taking parameters** per `session_id`
- Updates them smoothly (no big jumps)
- Enforces “forced rules” such as:
  - at most 1 question per turn (unless choices were explicitly requested)
  - avoid permission-template prompts (“OK to proceed?” etc.)

Implementation:

- `sigmaris_core/persona_core/phase03/naturalness_controller.py`

---

## Notes for production

- Do **not** expose `SUPABASE_SERVICE_ROLE_KEY` to the client. Server-side only.
- Prefer running the core close to users (region) to reduce first-token latency.
- If you deploy behind a proxy, ensure SSE buffering is disabled (or use a streaming-friendly runtime).
