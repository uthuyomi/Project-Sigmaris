**Languages:** [English](README.md) | 日本語

# Touhou Talk UI

このディレクトリは、**東方Projectを題材にした非公式の二次創作**のキャラクターチャットUIです。

Project Sigmaris の「UIバリアント」として、次を組み合わせています。

- **Supabase Auth**（OAuth）でログイン
- **Supabase DB**にセッション/メッセージを永続化
- **sigmaris_core（Persona OS）**をバックエンドとして応答生成（`/persona/chat` / `/persona/chat/stream`）

## ここに含まれるもの

- Next.js App Router のUI（`/entry`, `/chat/session`, `/auth/*`）
- Supabase の `common_*` テーブルを使ったセッション保存（`common_sessions`, `common_messages`）
- `sigmaris_core` へのプロキシAPI（必要に応じてファイル/リンク解析などでメッセージを拡張）
- PWA（`public/site.webmanifest`）と service worker 登録（`/sw.js`）
- Windows デスクトップ化（Electron、任意）

## 必要なもの

- Node.js + npm
- Supabase プロジェクト（URL / anon key / service role key）
- `sigmaris_core`（FastAPI）が起動していること（既定: `http://127.0.0.1:8000`）

## 環境変数

`touhou-talk-ui/.env.local` を用意してください（または、このモノレポのルート `.env` を使えます）。

必須:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（server-side only）
- `SIGMARIS_CORE_URL`（例: `http://127.0.0.1:8000`）

推奨（運用/ハードニング）:

- `NEXT_PUBLIC_SITE_URL`（metadata/sitemap/robots用。未設定なら `VERCEL_URL` か `http://localhost:3000`）
- `TOUHOU_ALLOWED_ORIGINS`（カンマ区切り。未設定時は同一originのみ許可）
- `TOUHOU_RATE_LIMIT_MS`（ユーザーごとの最低間隔ms。既定 `1200`）

任意（`/api/session/[sessionId]/message` の Phase04 機能）:

- `TOUHOU_UPLOAD_ENABLED`（`0/1`）→ `sigmaris_core` の `/io/upload`, `/io/parse` を使ってアップロード+解析を有効化
- `TOUHOU_LINK_ANALYSIS_ENABLED`（`0/1`）→ `/io/web/fetch`, `/io/web/search`, `/io/github/repos` を使ったリンク解析を有効化
- `TOUHOU_AUTO_BROWSE_ENABLED`（`0/1`）→ リンク解析が無効のときに自動ブラウズ（best-effort）

任意（AquesTalkローカルTTS）:

- `TOUHOU_TTS_ENABLE`（`1`で強制有効。未設定時は Windows かつ helper exe がある場合のみ自動有効）
- `TOUHOU_TTS_ALLOWED_EMAILS`（カンマ区切りの許可メール。これが空だと常に無効）
- `AQUESTALK_TTS_EXE_PATH`（helper exe のパス上書き）

## 動かし方（local）

```bash
cd touhou-talk-ui
npm install
npm run dev
```

`http://localhost:3000` を開きます。

補足:

- `npm run dev` は、モノレポの都合で **ルートの環境変数を先に読み込み**、その後 Next.js が `touhou-talk-ui/.env*` を読み込みます。
- チャット本体は `GET /chat/session`（`/chat` はここへリダイレクト）です。

## Auth / OAuth

- ログイン画面: `GET /auth/login`
- コールバック: `GET /auth/callback`（Supabaseの code exchange を server-side で実行）

Supabase Dashboard で利用したい OAuth provider を有効化し、Redirect URLs を設定してください（UI側は Google/GitHub/Discord を表示します）。

- `http://localhost:3000/auth/callback`
- `https://<your-domain>/auth/callback`

## 永続化モデル（Supabase）

このUIは `app = "touhou"` のスコープで、次のテーブルを利用します。

- `common_sessions`（会話セッション）
- `common_messages`（メッセージ）
- `common_state_snapshots`（任意：core が返す meta のスナップショット）

## 内部API（Next.js Route Handlers）

メイン（`/chat/session` が使用）:

- `GET /api/session`（セッション一覧、要ログイン）
- `POST /api/session`（セッション作成、要ログイン）
- `GET /api/session/[sessionId]/messages`（復元、要ログイン）
- `POST /api/session/[sessionId]/message`（送信、要ログイン）
  - Content-Type: `multipart/form-data`
  - `sigmaris_core` の `/persona/chat` / `/persona/chat/stream` に中継
  - キャラ人格は `persona_system`（`lib/touhouPersona.ts`）で注入

その他:

- `GET /api/io/attachment/[attachmentId]`（core の添付ダウンロードに中継）
- `POST /api/tts`（任意：許可メールのみ。無効時は 404）
- `POST /api/chat`（互換用：古いコンポーネント向け）

## デスクトップ版（Windows, 任意）

```bash
cd touhou-talk-ui
npm run desktop:dist
```

## 二次創作について（重要）

このプロジェクトは **非公式・非商用の二次創作**です。

原作・権利者（上海アリス幻樂団）とは無関係であり、公式のものではありません。

東方Projectに関するキャラクター/名称/設定等の権利は、原作者・権利者に帰属します。

## ライセンス

このディレクトリには専用のライセンスファイルが含まれていません。

本リポジトリおよび関連パッケージのライセンス表記に従ってください（例: `sigmaris-os/LICENSE`）。
