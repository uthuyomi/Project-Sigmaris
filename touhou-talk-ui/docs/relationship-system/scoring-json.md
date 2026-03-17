# 雰囲気スコア JSON（LLM出力仕様）

本機能では、チャット本文を生成するのと **同じモデル**を使って、各ターンの「雰囲気スコア（Relationship更新用）」を JSON で返させます。
返答は **JSONのみ**（Markdownや説明文を混ぜない）を厳守します。

## エンドポイント（core）

- `POST /persona/relationship/score`

入力（例）:

```json
{
  "session_id": "…",
  "character_id": "reimu",
  "chat_mode": "casual",
  "scope_key": "global",
  "user_message": "また仕事辞めたい",
  "assistant_message": "…",
  "relationship": { "trust": 0.2, "familiarity": 0.4 }
}
```

出力（例）:

```json
{
  "delta": { "trust": -1, "familiarity": 1 },
  "confidence": 0.72,
  "reasons": ["弱音の繰り返し", "相談への応答が成立"],
  "scopeHints": ["global"],
  "memory": {
    "topics_add": ["仕事"],
    "emotions_add": ["不安"],
    "recurring_issues_add": ["仕事ストレス"],
    "traits_add": ["悩みやすい"]
  }
}
```

## フィールド定義

- `confidence`（0..1）: 推定の確からしさ。低い場合は更新しない。
- `delta.trust`（int）: 信頼の方向性と強さ（推奨: -2..2）
- `delta.familiarity`（int）: 親密の方向性と強さ（推奨: -2..2）
- `reasons`（string[]）: デバッグ用途（UIには出さない前提）
- `scopeHints`（string[]）: 将来のスコープ分岐用の候補（現状 `["global"]`）
- `memory.*_add`（string[]）: Memoryへの追加パッチ（「追加」だけを表現）

## ガード（重要）

- **JSONのバリデーション失敗**は「スコア無し（更新無し）」として扱います。
- `confidence` が閾値未満の場合は **Δ=0**（更新しない）扱いにします。

