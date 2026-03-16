**Languages:** [English](README.md) | 日本語

# Touhou Talk UI

`touhou-talk-ui` は Project Sigmaris の Next.js UI。
Touhou Project にインスパイアされた **非公式の二次創作キャラチャットUI**で、Persona OSコアを“プロダクトっぽい形”で叩いて設計の強度を上げるための実験場だよ。

主な構成:

- Next.js（App Router）
- Supabase Auth（OAuth）+ 永続化（`common_*` テーブル）
- `gensokyo-persona-core` へプロキシして応答生成（`/persona/chat`, `/persona/chat/stream`）
- 任意: Electron デスクトップラッパ（Windows）

## ローカル起動（Web）

### 前提

- Node.js（LTS）+ npm
- Supabase プロジェクト
- `gensokyo-persona-core` が起動している（既定: `http://127.0.0.1:8000`）

### env

env は2パターンある（仕組み的にここがハマりどころ）:

- Next.js標準: `touhou-talk-ui/.env.local`
- モノレポ運用: repo root の `.env`（`npm run dev` は `tools/dev.mjs` でこれを先に読む）

最低限:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバ側のみ）
- `SIGMARIS_CORE_URL`（サーバ→コアURL。例: `http://127.0.0.1:8000`）
- `NEXT_PUBLIC_SIGMARIS_CORE`（クライアントに出すURL。ローカルは上と同じでOK）

### 起動

```bash
cd touhou-talk-ui
npm install
npm run dev
```

`http://localhost:3000`

## Supabase の Redirect URLs（OAuth）

Supabase Dashboard 側に以下のようなURLを登録する:

- `http://localhost:3000/auth/callback`（Web開発）
- `http://localhost:3789/auth/callback`（デスクトップ既定。下記参照）
- `https://<your-domain>/auth/callback`（本番）

## 内部API（Next.js Route Handlers）

チャットの主要フロー:

- `GET /api/session` / `POST /api/session`
- `GET /api/session/[sessionId]/messages`
- `POST /api/session/[sessionId]/message`（`?stream=1` 対応）
  - コアへプロキシ（`/persona/chat` / `/persona/chat/stream`）
  - Supabaseへ保存（`common_sessions`, `common_messages`）

デスクトップ専用:

- `GET /api/desktop/character-settings`（設定UIが参照）

## デスクトップ（Electron / Windows、任意）

デスクトップ版は「ローカル専用」。UIをElectronで包んで、キャラごとの設定（VRM / TTS / モーション）をディスクへ保存する。

### 開発起動

```bash
cd touhou-talk-ui
npm run desktop:dev
```

`desktop:dev` は次をやる:

- `3000` から順に空きポートを探して Next dev を起動
- `tools/dev.mjs` 経由で Next を立ち上げる（env を揃えるため）
- Electron（`tools/desktop/main.cjs`）を起動

### デスクトップ用 env ファイル

開発ランナーは、専用の env ファイルを読める:

- `TOUHOU_DESKTOP_ENV_PATH`（ファイルパス指定）
- 未指定なら `%LOCALAPPDATA%/TouhouTalkDesktopDev/touhou-talk.env`（環境により `%APPDATA%`）

ローカル開発用だよ。特権キーは入れない方が安全。

### 配布ビルド

```bash
cd touhou-talk-ui
npm run desktop:dist
```

## 二次創作に関する注意

このUIは Touhou Project にインスパイアされた **非公式・非営利の二次創作**。
原作者/権利者とは無関係で、公式に承認されているわけではない。
