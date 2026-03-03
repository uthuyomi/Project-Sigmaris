# roleplayモードのプロンプト注入を安定化する（touhou-talk-ui × sigmaris_core）

目的は「キャラ再現度のために強い persona_system を入れたい」時に、core側の後段注入（自然さ・会話契約・メモリ等）が綱引きになって破綻するのを避けること。

この変更は **roleplayモードのみ** を主対象にしている（sigmaris-os など他アプリへの影響を最小にするため）。

## 何が起きていたか（問題）

- UIから `persona_system`（キャラ指示が長い）を送る
- core側も「会話自然さ」「契約」「メモリ注入」などを **後ろに追記**する
- すると、roleplayの“強い指示”とcoreの“汎用自然さ指示”が競合して
  - 口調がブレる
  - 禁止事項が混ざって不自然になる
  - 長文化しやすい
  - 安定して同じ挙動にならない

## 変更点（概要）

### 1) core側：roleplayでは“綱引き”を減らす

- `sigmaris_core/persona_core/phase03/conversation_contract.py`
  - `chat_mode == "roleplay"` のとき、会話契約（contract）を適用しない。
- `sigmaris_core/persona_core/phase03/roleplay_character_policy.py`
  - `chat_mode == "roleplay"` かつ `metadata.persona_system` が存在する（UIが外部personaを注入している）場合、
    - `disable_naturalness_injection=True`
    - `stop_memory_injection=True`
  - つまり、roleplay中に **外部personaがあるときだけ** coreの追加注入を止める。

狙い：roleplayでは UI側personaを“主”にして、coreはなるべく黙る。

### 2) UI側：プロンプト肥大と再現性の問題を抑える

- `touhou-talk-ui/lib/touhouPersona.ts`
  - `buildTouhouPersonaSystem()` に以下のオプションを追加：
    - `includeExamples?: boolean`
    - `includeRoleplayExamples?: boolean`
  - `includeExamples=false` のとき `# Examples (few-shot)` を出さない。
  - `includeRoleplayExamples=false` のとき、`roleplayAddendum` 内の `# Few-shot Examples` を削除してサイズを抑える。

- `touhou-talk-ui/app/api/session/[sessionId]/message/route.ts`
  - “seed turn（初回のアシスタント応答）だけ” few-shot を有効にする。
    - 初回はキャラの立ち上がりに効く
    - 2ターン目以降はコストだけ増えるので削る
  - `persona_system` の SHA-256 を計算して `meta.touhou_ui.persona_system_sha256` として保存する。
    - persona本文はDBに残さず（長すぎる/漏洩リスク/差分追跡が難しいため）
    - でも「どのpersonaで生成されたか」は追える
  - ストリーミング経路でも `meta.touhou_ui` を必ず付与して保存する（非ストリームと統一）。

## 期待できる効果

- roleplayで口調・方針のブレが減る（coreの後段注入による“引っ張り”を減らすため）
- token効率が上がる（few-shotを初回のみに制限）
- “同じ設定で同じ品質”が出やすい（persona hashで再現性デバッグができる）

## 注意点

- roleplayの品質は **UIが送る persona_system の設計に強く依存**する。
  - core側の“汎用補正”を止めた分、personaが雑だと雑なまま返る。
- `persona_system_sha256` は「同一personaかの識別」用で、内容の復元はできない。

