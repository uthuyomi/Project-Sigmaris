# Relationship / Memory System（仕様）

Touhou-talk に「キャラクター × ユーザー関係性」を導入するための仕様ドキュメントです。
ブラウザ版・デスクトップ版で同一アカウント（同一 Supabase プロジェクト）を使う場合、同じ体験（同じ関係性・記憶）を再現できることを目的にしています。

## 目的

- 「自分だけに反応している」感を作る
- 継続利用（リピート）を生む
- 実用性（相談/整理）と楽しさ（キャラ体験）を両立する

## 用語

- **Relationship**: キャラ別の関係性（`trust` / `familiarity` を主軸に、負方向も含む）
- **Memory**: 会話から抽出した意味情報（topics/emotions/recurring issues/traits）
- **Scope**: 同じユーザーでも「どの文脈での関係/記憶か」を分けるキー（将来拡張用）

## 流れ（1ターン）

1. ユーザー発言を受け取る
2. 同じモデルで「雰囲気スコア JSON」を生成（副作用なし）
3. Relationship / Memory を **小さく** 更新（クリップ＋EMA、confidence が低い場合は更新しない）
4. Relationship / Memory を Prompt に反映して応答を生成
5. 返答を保存し、次ターンへ

## 収録ドキュメント

- `data-model.md`（保存設計：Relationship/Memory/Scope）
- `scoring-json.md`（LLM が返す JSON 仕様）
- `update-rules.md`（更新ルール：Δクリップ、EMA、閾値、負方向の扱い）
- `prompt-integration.md`（プロンプト合成への組み込み）
- `safety-guardrails.md`（安全ガード：負関係の表現、攻撃的出力の抑止）
- `world-integration.md`（WorldState/イベントの文脈注入）
- `ui-management.md`（確認・リセット・輸出入の管理UI）
