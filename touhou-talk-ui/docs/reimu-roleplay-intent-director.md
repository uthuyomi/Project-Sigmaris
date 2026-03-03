# 霊夢（roleplay）: 意図判定 → Director overlay → output_style 強制

このドキュメントは `touhou-talk-ui` の **roleplay モード（霊夢）**で、ターンごとに
「意図を判定して、霊夢の振る舞いを上書きし、出力形式を強制する」ための実装メモです。

## 目的

- どんな入力でも **霊夢の崩壊を減らす**
- 「心理分析AIっぽさ」や「決め台詞暴発」を抑える
- 返信の **フォーマットを毎ターン安定**させる（`output_style`）
- 速度は落としすぎない（短い JSON、キャッシュ、低信頼時のみ再判定）

## 仕組み（全体像）

1. UI（`/api/session/[sessionId]/message`）が core に **意図判定**を要求
2. 返ってきた JSON をもとに UI が **Director overlay** を `persona_system` に追記
3. core が通常の `/persona/chat` 生成を行う
4. UI が最終返信を **lint（形式検査）**
5. 形式が崩れていたら **リライトを 1 回だけ**実行し、`done` を差し替える（stream 時）

## 適用範囲（スコープ）

- `chat_mode=roleplay` かつ `character_id=reimu` のときだけ有効
- その他のキャラ/モードは現状維持

## 意図判定 API（sigmaris-core）

- `POST /persona/intent`
- 入力: `message`, `history`（直近数件）, `character_id`, `chat_mode`, `session_id`
- 出力（JSON）:
  - `intent`: `banter|chitchat|advice|task|incident|lore|roleplay_scene|meta|safety|unclear`
  - `confidence`: 0..1
  - `output_style`: `normal|bullet_3|choice_2`
  - `allowed_humor`: boolean
  - `urgency`: `low|normal|high`
  - `needs_clarify`: boolean
  - `clarify_question`: string
  - `safety_risk`: `none|low|med|high`

### 速度設計

- ルール即決（`meta`/`safety`）→ LLM → `confidence<0.85` のときだけ強い再判定
- 短期キャッシュ（デフォルト 10 秒）

### 関連 env（任意）

- `SIGMARIS_INTENT_MODEL_FAST`
- `SIGMARIS_INTENT_MODEL_STRONG`
- `SIGMARIS_INTENT_MAX_TOKENS`（デフォルト 350）
- `SIGMARIS_INTENT_CONFIDENCE_THRESHOLD`（デフォルト 0.85）
- `SIGMARIS_INTENT_CACHE_TTL_SEC`（デフォルト 10）
- `SIGMARIS_INTENT_CACHE_MAX`（デフォルト 2048）

## Director overlay（touhou-talk-ui）

UI 側で `persona_system` 末尾に **ターン限定の上書きブロック**を追記します。

- intent 情報（ログ/分析用）
- `output_style` 強制（機械判定しやすい形式）
- 「心理分析禁止」「決め台詞暴発禁止」「賽銭の暴走防止」などをターンごとに注入
- `needs_clarify=true` の場合は **確認質問を 1 つだけ**出して止める（他は禁止）

## output_style の lint（強制）

返信が overlay の形式に従っているか UI 側で検査します。

- `bullet_3`: `- ` で始まる **3 行のみ**
- `choice_2`: `A)` と `B)` の **2 行のみ**
- `normal`: **1〜10 行**、最後が `？` / `?` で終わる
- `needs_clarify=true`: **質問 1 個のみ**（`？`/`?` が 1 個、かつ末尾で終わる）

違反時は `/persona/chat` を **1 回だけ**追加で呼び、DRAFT を形式に合わせてリライトします。

## どこを触っているか

- UI: `touhou-talk-ui/app/api/session/[sessionId]/message/route.ts`
  - `/persona/intent` 呼び出し
  - `persona_system` への overlay 追記
  - lint → 失敗時 1 回だけリライト
  - `meta.touhou_ui` に intent/forced 結果を保存
- core: `sigmaris_core/persona_core/server_persona_os.py`
  - `POST /persona/intent` 追加（JSON-only）

## 将来（他キャラ展開）

- `shouldUseDirectorOverlay()` のスコープを広げる（キャラごとに ON/OFF）
- `character_id` ごとに overlay の辞書を追加（intent×style の組を増やす）
- テストケース（意図別の期待）を増やして劣化を検知する

