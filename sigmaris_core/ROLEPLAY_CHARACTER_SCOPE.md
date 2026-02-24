# ロールプレイ×キャラ別スコープ（sigmaris-core 側の制御）

目的：
- `touhou-talk-ui` のロールプレイモード（`chat_mode=roleplay`）を `sigmaris-core` に伝搬する
- `roleplay × character_id` のときだけ、キャラクター性を最大化するための“強制できる”処理を core 側に足す
- `sigmaris-os`（別系統）には干渉しない（`/persona/chat` 経路のみで完結）

## 1. 何が問題だったか
`sigmaris-core` には Phase03 の **Naturalness**（会話の自然さ制御）があります。
これは毎ターン、ユーザー入力に応じて `persona_system` に方針ブロックを追記したり、生成後に出力をサニタイズします。

ただし、キャラによってはこの一般方針が **キャラクターの型（例：2択・遊び・テンポ）を潰す**ことがあります。
例：こいしの「2択」「あてっこ」などは、サニタイズの「?は1個まで」「どっち？の除去」等と衝突しやすい。

## 2. 実装したこと（データの流れ）

### 2.1 UI → core へ `chat_mode` を送る
- 変更: `touhou-talk-ui/app/api/session/[sessionId]/message/route.ts`
- `/persona/chat` と `/persona/chat/stream` の両方に `chat_mode` を同封

### 2.2 core が `chat_mode` を受け取って metadata に載せる
- 変更: `sigmaris_core/persona_core/server_persona_os.py`
- `ChatRequest.chat_mode` を追加
- `PersonaRequest(context=...)` に `chat_mode` を入れて、下流の controller/llm が参照できるようにした

## 3. core 側の「ロールプレイ×キャラ別」ポリシー

### 3.1 ポリシー定義
- 追加: `sigmaris_core/persona_core/phase03/roleplay_character_policy.py`
- `chat_mode == "roleplay"` のときだけ `character_id` でポリシーを返す（今は `koishi` を先行実装）

主なノブ：
- Naturalness の system 追記をスキップするか
- サニタイズの「質問記号の最大数」「2択（インタビューっぽい語）除去」の挙動
- 生成パラメータ（`quality_pipeline` の強制ON、`max_tokens` 上限など）
- メモリ注入（LLMプロンプトへの memory injection）を止めるか

### 3.2 controller への適用
- 変更: `sigmaris_core/persona_core/controller/persona_controller.py`
- `handle_turn` と `handle_turn_stream` の両方で：
  - `roleplay_policy` を算出して `meta["roleplay_policy"]` に記録
  - 必要なら `req.metadata["gen"]` を上書き（品質パイプラインON、max_tokens cap など）
  - 必要なら `req.metadata["_phase03_stop_memory_injection"] = True`
  - Naturalness の注入をスキップ（こいしの場合）
  - `sanitize_reply_text(...)` をポリシーに沿った引数で呼ぶ

### 3.3 サニタイズの拡張
- 変更: `sigmaris_core/persona_core/phase03/naturalness_controller.py`
- `sanitize_reply_text` に以下の引数を追加（後方互換のデフォルトあり）：
  - `max_questions`（質問記号の上限。デフォルト 1）
  - `remove_interview_prompts`（`どっち？` 等の除去をするか。デフォルト True）

## 4. こいし（roleplay）の現行ポリシー
`character_id == "koishi"` かつ `chat_mode == "roleplay"` のとき：
- Naturalness の system 追記をスキップ（キャラの2択テンポを潰さない）
- サニタイズの質問上限を 2 に緩和
- 「どっち？」等の除去を無効化（2択の維持）
- `quality_pipeline` を強制ON（`quality_mode="roleplay"`）
- `max_tokens` を上限 520 にキャップ（短文化の後押し）
- memory injection を停止（長文化/分析寄りへの引っ張られを抑制）

## 5. 将来：全キャラ対応の拡張ポイント
- `roleplay_character_policy.py` にキャラごとのポリシーを追加する
- 「Naturalnessを無効化」ではなく「キャラ専用の自然さプロファイル」を作る方向にも拡張可能
- `max_questions_per_turn` 等のノブで“キャラごとの型”を維持しやすい

## 6. sigmaris-os への非干渉
この変更は `touhou-talk-ui` のセッション経由で叩く `sigmaris-core /persona/chat` に限定したデータと処理です。
`sigmaris-os` 側の別経路（別サーバ）には依存・干渉しない設計です。

