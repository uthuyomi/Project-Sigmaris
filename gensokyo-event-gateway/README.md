# gensokyo-event-gateway

Optional WebSocket gateway that streams ordered world events from Supabase (`world_event_log`).

Design goals:

- UI clients connect over WS
- Subscribe to a `channel` (e.g. `world:gensokyo_main:hakurei_shrine`)
- Receive a snapshot (from `lastSeq + 1`) and then live inserts via Supabase Realtime (no polling)

## Run locally

### Prerequisites

- Node.js (LTS) + npm
- Supabase schema applied (`supabase/GENSOKYO_WORLD_SCHEMA.sql`)

### Install

```powershell
cd gensokyo-event-gateway
npm install
```

### Env

The provided scripts read `../.env` via Node's `--env-file`.

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `SUPABASE_SCHEMA` (default: `public`)
- `GENSOKYO_EVENT_GATEWAY_HOST` (default: `127.0.0.1`)
- `GENSOKYO_EVENT_GATEWAY_PORT` (default: `8787`)
- `GENSOKYO_EVENT_GATEWAY_ALLOW_ANON=1` (default: `1` for local dev; set `0` in production)

### Build & start

```powershell
npm run build
npm run start
```

Default WS URL: `ws://127.0.0.1:8787`

## Protocol (minimal)

Client messages:

- `{"type":"hello","auth":{"mode":"supabase_jwt","access_token":"..."}}`
- `{"type":"subscribe","channel":"world:gensokyo_main:hakurei_shrine","lastSeq":123}`
- `{"type":"unsubscribe","channel":"world:gensokyo_main:hakurei_shrine"}`

Server messages:

- `{"type":"ack","hello":true}`
- `{"type":"snapshot","channel":"...","fromSeq":124,"events":[...]}`
- `{"type":"event","channel":"...","event":{...}}`
- `{"type":"error","code":"...","message":"..."}`
