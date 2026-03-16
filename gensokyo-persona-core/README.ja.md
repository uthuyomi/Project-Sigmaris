**Languages:** [English](README.md) | 日本語

# gensokyo-persona-core

Project Sigmaris の “Persona OS” を実装する FastAPI バックエンドだよ。
UI（`touhou-talk-ui/`）は、Next.js の Route Handler 経由でこのコアへプロキシして会話を生成する仕組み。

提供する主要API:

- `POST /persona/chat`（JSON）
- `POST /persona/chat/stream`（SSEストリーミング）
- Phase04（任意）: web fetch / web RAG / upload など外部I/O

## ローカル起動

### 前提

- Python 3.11+

### インストール

```bash
cd gensokyo-persona-core
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
```

### env 設定

ローカル開発では、repo root の `.env` を使う運用を想定してる（`persona_core/storage/env_loader.py`）。
`../.env.example` をコピーして、最低限これを入れる:

- `OPENAI_API_KEY`

任意（永続化/認証/運用）:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバ側のみ）
- `SIGMARIS_REQUIRE_AUTH=1`（外部公開するなら推奨）

### 起動

```bash
./.venv/Scripts/python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Swagger: `http://127.0.0.1:8000/docs`

## 認証モデル（重要）

このコアは2系統の認証を持つ（どっちも “仕組みが分かれば事故りにくい” やつ）。

1) **Supabase JWT（UI向け）**
   - `Authorization: Bearer <access_token>` を送る
   - Supabase でユーザーを解決して user_id に紐づける（best-effort）

2) **内部トークン（ローカル/サービス間）**
   - `SIGMARIS_INTERNAL_TOKEN` を設定
   - `X-Sigmaris-Internal-Token: <token>` を送る
   - `SIGMARIS_DEFAULT_USER_ID`（既定: `default-user`）として扱う

## API

### `POST /persona/chat`

最小例:

```bash
curl -X POST "http://127.0.0.1:8000/persona/chat" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u_test_001","session_id":"s_test_001","message":"こんにちは。1文で返して。"}'
```

レスポンスは `reply`（文字列）と `meta`（常に non-null の構造化情報）を含む。

### `POST /persona/chat/stream`（SSE）

```bash
curl -N -X POST "http://127.0.0.1:8000/persona/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u_test_001","session_id":"s_test_001","message":"こんにちは。ストリームして。"}'
```

運用メモ:

- リバースプロキシ配下で動かすなら **SSEバッファリング無効** が必須。
- このリポジトリのUIは、Next.js Route Handler を挟んでSSEをそのまま中継する。

## Web fetch / Web RAG（任意、Phase04）

SSRFガード付きの web fetch と、制限付きクロール＋抽出＋ランキングを行う web RAG パイプラインが入ってる。

### web fetch allowlist

許可しない限り fetch はブロックされる:

- `SIGMARIS_WEB_FETCH_ALLOW_DOMAINS`（例: `wikipedia.org, nhk.or.jp`）
- `SIGMARIS_WEB_FETCH_ALLOW_ALL=1`（開発用。雑にONにしない）

### web RAG のトグル

- `SIGMARIS_WEB_RAG_ENABLED=1`（`/io/web/rag` を有効化）
- `SIGMARIS_WEB_RAG_AUTO=1`（任意。自動トリガー）

検索プロバイダ（任意）:

- `SERPER_API_KEY`

## コードの入り口（迷子防止）

- APIサーバ: `persona_core/server_persona_os.py`
- 外部I/O: `persona_core/phase04/io/`
- 記憶/永続化: `persona_core/memory/`, `persona_core/storage/`
- Safety: `persona_core/safety/`
- 状態機械: `persona_core/state/`
