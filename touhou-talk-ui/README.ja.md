**Languages:** [English](README.md) | 日本語

# Touhou Talk UI

`touhou-talk-ui` は Project Sigmaris モノレポ内の Next.js フロントエンドです。  
東方 Project に着想を得た非公式の二次創作チャット UI で、キャラクターとの対話体験をプロダクトとして成立させることを目的に設計しています。

この UI では、単なるチャット画面ではなく、次のような体験を扱っています。

- Next.js App Router ベースの Web アプリ
- Supabase Auth による OAuth ログイン
- セッション単位のチャット履歴保存
- 幻想郷マップからのキャラクター導線
- テーマ切り替えと演出付きの導入画面
- Electron によるデスクトップ実行
- VRM / TTS / モーション設定によるキャラクター表現の拡張

## 技術スタック

- Next.js
- React
- TypeScript
- Supabase
- Tailwind CSS
- three.js / @pixiv/three-vrm
- Electron

## ローカル起動

### 前提

- Node.js LTS
- npm
- Supabase プロジェクト
- 起動済みの `gensokyo-persona-core`

デフォルトの persona core URL:

- `http://127.0.0.1:8000`

### 環境変数

次のいずれかで設定できます。

- `touhou-talk-ui/.env.local`
- リポジトリルートの `.env`

最低限必要なキー:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SIGMARIS_CORE_URL`
- `NEXT_PUBLIC_SIGMARIS_CORE`

### Web アプリ起動

```bash
cd touhou-talk-ui
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## Supabase OAuth リダイレクト設定

Supabase Dashboard で次のような URL を追加してください。

- `http://localhost:3000/auth/callback`
- `http://localhost:3789/auth/callback`
- `https://<your-domain>/auth/callback`

## 主な API ルート

チャット関連:

- `GET /api/session`
- `POST /api/session`
- `GET /api/session/[sessionId]/messages`
- `POST /api/session/[sessionId]/message`

デスクトップ関連:

- `GET /api/desktop/character-settings`

## デスクトップモード

Electron ラッパーを使うと、ローカル専用のデスクトップアプリとして動作します。  
キャラクターごとの VRM / TTS / モーション設定をローカル保存できます。

### 開発起動

```bash
cd touhou-talk-ui
npm run desktop:dev
```

### 配布ビルド

```bash
cd touhou-talk-ui
npm run desktop:dist
```

## ポートフォリオ観点での見どころ

- 世界観と UI 演出を一体で設計していること
- 認証、永続化、チャット導線まで含めたプロダクト構成
- Web と Electron の両方で同一体験を組み立てていること
- 3D アバターと音声設定を UI 側から扱っていること

## 注意

このプロジェクトは東方 Project に着想を得た非公式・非商用の二次創作です。  
原作の権利元・関係者とは無関係であり、公式の製品ではありません。
