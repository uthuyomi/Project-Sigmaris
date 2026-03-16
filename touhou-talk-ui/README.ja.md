**Languages:** [English](README.md) | 日本語

# Touhou Talk UI

`touhou-talk-ui` は Project Sigmaris の Next.js UI です。  
Touhou Project にインスパイアされた **非公式の二次創作キャラチャット UI** として、Persona OS コアを“実運用に近い UX”で検証することを目的としています。

主な構成:

- Next.js（App Router）
- Supabase Auth（OAuth）+ 永続化（`common_*` テーブル）
- `gensokyo-persona-core` へプロキシして応答生成（`/persona/chat`, `/persona/chat/stream`）
- 任意: Electron デスクトップラッパ（Windows）

## ローカル起動（Web）

### 前提

- Node.js（LTS）+ npm
- Supabase プロジェクト
- `gensokyo-persona-core` が起動していること（既定: `http://127.0.0.1:8000`）

### env

env は以下いずれかで設定できます。

- Next.js 標準: `touhou-talk-ui/.env.local`
- モノレポ運用: repo root の `.env`（`npm run dev` は `tools/dev.mjs` でこれを先に読み込みます）

最低限:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバ側のみ）
- `SIGMARIS_CORE_URL`（サーバ→コア URL。例: `http://127.0.0.1:8000`）
- `NEXT_PUBLIC_SIGMARIS_CORE`（クライアントに公開する URL。ローカルは上と同一で問題ありません）

### 起動

```bash
cd touhou-talk-ui
npm install
npm run dev
```

`http://localhost:3000`

## Supabase の Redirect URLs（OAuth）

Supabase Dashboard 側に以下のような URL を登録してください。

- `http://localhost:3000/auth/callback`（Web 開発）
- `http://localhost:3789/auth/callback`（デスクトップ既定。下記参照）
- `https://<your-domain>/auth/callback`（本番）

## 内部 API（Next.js Route Handlers）

チャットの主要フロー:

- `GET /api/session` / `POST /api/session`
- `GET /api/session/[sessionId]/messages`
- `POST /api/session/[sessionId]/message`（`?stream=1` 対応）
  - コアへプロキシ（`/persona/chat` / `/persona/chat/stream`）
  - Supabase へ保存（`common_sessions`, `common_messages`）

デスクトップ専用:

- `GET /api/desktop/character-settings`（設定 UI が参照します）

## デスクトップ（Electron / Windows、任意）

デスクトップ版はローカル専用のラッパです。  
キャラクターごとの設定（VRM / TTS / モーション）をディスクへ保存し、UI を Electron シェル内で動作させます。

### 開発起動

```bash
cd touhou-talk-ui
npm run desktop:dev
```

`desktop:dev` は以下を行います。

- `3000` から空きポートを探索して Next dev を起動します
- `tools/dev.mjs` 経由で Next を起動し、SSR/API 側にも env を引き継ぎます
- Electron（`tools/desktop/main.cjs`）を起動します

### デスクトップ用 env ファイル

開発ランナーは、専用の env ファイルを読み込めます。

- `TOUHOU_DESKTOP_ENV_PATH`（ファイルパス指定）
- 未指定の場合は `%LOCALAPPDATA%/TouhouTalkDesktopDev/touhou-talk.env`（環境により `%APPDATA%`）

## 二次創作に関する注意

本 UI は Touhou Project にインスパイアされた **非公式・非営利の二次創作**です。  
原作者/権利者とは無関係であり、公式に承認されているものではありません。

