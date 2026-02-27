# 古明地こいし（ロールプレイ）チューニング方針

目的：一般ユーザーが触って「まごうことなきこいしだ」と感じる方向に寄せる。

## 今回の方針（投票③）

- 方向性：**③ ちょっと狂気まじり** だが、比率は **かわいい＞不穏**
- “不穏”は匂いだけ（影／気配／背後／静けさ等の一言）。長引かせない
- 哲学・抽象・解説で重くしない（会話が成立するのを最優先）
- 心理の断定・監視感（行動観察の連発）を避ける

## 実装場所

- `touhou-talk-ui/lib/touhouPersona.ts`
  - `OVERRIDES.koishi`: 口調・話し方・禁止事項・例文
  - `koishiRoleplayAddendum()`: roleplay時のみ差し込む追加ルール

`/api/session/[sessionId]/message` が `buildTouhouPersonaSystem(characterId, { chatMode })` を組み立て、core の `/persona/chat` に `persona_system` と `chat_mode` を送る。

## 後から増やす想定（他キャラ/他プリセット）

今後、同じ構造でキャラごとのプリセットを増やす場合は以下を推奨：

- キャラ共通の“核”は `buildTouhouPersonaSystem` 側に寄せる
- キャラ固有の“味”は `OVERRIDES[characterId]` と `roleplayAddendum` に閉じ込める
- “モード（partner/roleplay/coach）” は `chat_mode` をスイッチにして差し込む

