# Data Model（保存設計）

本ドキュメントは Relationship / Memory を **ブラウザ版・デスクトップ版共通**で保存するためのデータ設計を定義します。
保存先は **Supabase（同一プロジェクト）**を前提にしています。

## 1. Relationship（キャラ別の関係性）

テーブル（既存を拡張）: `public.player_character_relations`

主なカラム:

- `user_id` (uuid / text): ユーザー識別子
- `character_id` (text): キャラクターID（例: `reimu`）
- `scope_key` (text): 文脈スコープ（現状は `global` 固定、将来拡張）
- `trust` (float): 信頼度 **[-1.0, 1.0]**（負方向を許容）
- `familiarity` (float): 親密度 **[0.0, 1.0]**（負にしない）
- `rev` (int): 楽観ロック用のリビジョン（増分）
- `last_updated` (timestamptz / text): 更新時刻

注意:

- 現行実装は `onConflict: "user_id,character_id"` を想定しています。
- `scope_key` を本格運用（B展開）する場合、**ユニーク制約を `user_id,character_id,scope_key` に変更**し、UI/API側も合わせて更新する必要があります。

## 2. Memory（意味抽出済みユーザー理解）

テーブル（新規）: `public.touhou_user_memory`

主なカラム:

- `user_id` (uuid / text)
- `scope_key` (text): 現状 `global`
- `topics` (jsonb text[]): 話題（例: `["仕事"]`）
- `emotions` (jsonb text[]): 感情ラベル（例: `["不安"]`）
- `recurring_issues` (jsonb text[]): 繰り返しの悩み（例: `["仕事ストレス"]`）
- `traits` (jsonb text[]): 特性（例: `["悩みやすい"]`）
- `rev` (int): リビジョン
- `updated_at` (timestamptz / text): 更新時刻

制約/ポリシー:

- `user_id + scope_key` で一意（upsert前提）
- RLS: `auth.uid() = user_id` のみ読み書き可能（ユーザー単位の隔離）

## 3. Raw Logs（会話ログ）

Raw messages は既存テーブル（例: `common_messages`）に保存し、Relationship/Memory は **抽出済みの意味情報のみ**を保存します。
プロンプトへは「Raw全部投げ」を避け、ノイズとコストを抑えます。

