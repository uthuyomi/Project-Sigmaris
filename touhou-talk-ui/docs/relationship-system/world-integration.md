# WorldState Integration（世界イベントの組み込み）

Touhou-talk は任意で `gensokyo-world-engine` を参照し、世界の状態（季節/天気/時間帯/異変）や直近イベントを **応答の文脈**として利用できます。

## 1. データソース

- UI → `touhou-talk-ui/app/api/world/*` → `gensokyo-world-engine`

参照される主なエンドポイント:

- `GET /world/state?world_id=...&location_id=...`
- `GET /world/recent?world_id=...&location_id=...&limit=...`

## 2. 応答への注入

`/api/session/[sessionId]/message` が `common_sessions.layer/location` を参照し、World snapshot を `persona_system` に追記します。

目的:

- 返答に「今そこにいる」感（季節/天気/時間帯、異変、最近の出来事）を自然に反映する
- UIから明示的に見せなくても、会話の雰囲気が揃う

## 3. 環境変数

- `TOUHOU_WORLD_PROMPT_ENABLED`（default: `true`）
  - `false` の場合、World snapshot の取得/注入を行いません。

## 4. UI上の補助（任意）

チャットのヘッダに、現在の world snapshot（季節/天気/時間帯/異変）を表示できます。
表示は補助であり、応答の本体は prompt への注入で制御します。

