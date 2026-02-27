# 応答処理層の強化（初見継続率向け）v1

目的: **初見ユーザーが「外れた」「怖い」「長い」で離脱しにくい** 応答を、UIではなく core 側（`/persona/chat`）で安定させる。

この改修は **sigmaris-os 等の別クライアントを壊さない** ために、基本は **外部persona注入（`persona_system`）がある場合にのみ発動**するようにスコープしています。

## 何を追加したか

### 1) 会話意図（Conversation intent）の推定
- 既存の Phase03 のヒューリスティックを利用し、ターンごとに `IntentLayers` を計算して
  - `primary`（例: `TASK_EXECUTION` / `ROLEPLAY_CREATIVE` など）
  - `confidence`
  を `req.metadata` と `meta` に記録します。
- **心理分析（精神状態の推測）ではなく**、「質問/作業/雑談/メタ」など *返答形式の調整に必要な範囲* のみを扱います。

実装:
- `sigmaris_core/persona_core/controller/persona_controller.py`
  - `IntentLayers().compute(...)` を `_apply_naturalness_policy()` 内で実行
  - `meta["conv_intent"]` と `md["_conv_intent_*"]` を付与

### 2) Conversation Contract（短文・非断定・非メタ分類）の注入
外部persona（Touhouキャラ等）の system に対して、core側から **後段ポリシー** を追記します。

主なルール:
- 噛み合わない時は **事実確認を1つだけ**
- **質問は最大1つ**
- **2〜6行程度**を目安に短く
- ユーザーが明示していない **感情・精神状態を推測/断定しない**
- 「挨拶/調子チェック/分類すると〜」のような **メタ分類説明をしない**
- **脈絡のない決め台詞を足さない**（必要なら削る）

加えて、`目的:` 等でユーザーが **明示的にゴールを書いた場合**だけ、それを `User-stated goal` として注入します。

実装:
- `sigmaris_core/persona_core/phase03/conversation_contract.py`
  - `extract_explicit_goal()`（保守的: ラベル付きのみ）
  - `build_conversation_contract()`（契約文を生成）
  - `should_apply_contract()`（`persona_system` がある時だけ適用）
- `sigmaris_core/persona_core/controller/persona_controller.py`
  - `_apply_naturalness_policy()` で `# Conversation Naturalness` の後に contract を追記
  - **明示ゴールのセッション内記憶**（`_explicit_goal_by_session`）を追加

### 3) 生成後 postprocess（決め台詞/メタ分類/感情断定の削除）
プロンプトだけでは漏れるため、生成後に **保守的な後処理**を入れました（文単位の削除が中心）。

現在の内容（v1）:
- メタ分類っぽい1文（例: 「挨拶？それとも調子チェック？」）を削除
- **こいし（roleplay）**の場合:
  - 文脈トリガーが無いのに先頭が「みつけた」「やっほー」になっている場合は削除
- ユーザーが感情を明示していない場合:
  - 「君はいま不安だよね」など **2人称+感情断定**の文を削除

実装:
- `sigmaris_core/persona_core/phase03/reply_postprocess.py`
  - `postprocess_reply_text(...)`
- `sigmaris_core/persona_core/phase03/naturalness_controller.py`
  - `sanitize_reply_text(...)` に追加引数を増やし、scoped時のみ postprocess を適用
- `sigmaris_core/persona_core/controller/persona_controller.py`
  - `sanitize_reply_text(...)` 呼び出しに `user_text/client_history/character_id/chat_mode` を渡す

## どのリクエストに効くか（スコープ）
- **原則: `persona_system` がある場合のみ** contract/postprocess を有効化します。
  - 理由: sigmaris-os 等の別クライアントの挙動を不用意に変えないため
  - 判定: `should_apply_contract(md)`（`md["persona_system"]` の有無）

## 変更点の一覧（ファイル）
- 追加:
  - `sigmaris_core/persona_core/phase03/conversation_contract.py`
  - `sigmaris_core/persona_core/phase03/reply_postprocess.py`
  - `sigmaris_core/persona_core/docs/response-hardening-v1.md`
- 更新:
  - `sigmaris_core/persona_core/controller/persona_controller.py`
  - `sigmaris_core/persona_core/phase03/naturalness_controller.py`

## チューニングの入口
- contract文言の調整: `conversation_contract.py`
- こいしの決め台詞条件: `reply_postprocess.py` 内のトリガー定義
- “精神状態探り”の除去条件: `reply_postprocess.py` の `emotion_label` ルール（保守的にしてある）

