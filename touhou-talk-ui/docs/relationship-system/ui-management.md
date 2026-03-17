# UI / Management（確認・リセット・輸出入）

Relationship/Memory は「見せるより効かせる」が基本方針ですが、運用とデバッグのために管理UIを提供します。

## 1. 管理画面

- `GET /settings/relationship`

できること:

- キャラ別の `trust/familiarity` を確認（メーター表示）
- `Memory`（topics/emotions/recurring issues/traits）を確認
- リセット（キャラ単位 / 全体 / Memoryのみ）
- エクスポート / インポート（JSON）

## 2. API

管理UIが利用する API:

- `GET /api/relationship`
  - `?characterId=...` で単体取得、未指定で一覧
- `POST /api/relationship/reset`
- `GET /api/relationship/export`
- `POST /api/relationship/import`

注意:

- 認証は Supabase セッション（cookie）を前提とします。
- RLS により `user_id = auth.uid()` のデータのみを操作できます。

