# Sigmaris Persona Core（v2）: 構成メモ（日本語）

このフォルダの Persona Core v2 は、LLM を「そのまま喋らせる」のではなく、
**内部状態（記憶・同一性・価値・特性・モード）を持って更新しながら**返答を生成するための層です。

## 入口（サーバ）

- `sigmaris_core/persona_core/server_persona_os.py`
  - FastAPI の `/persona/chat` が 1ターンの入口
  - `SIGMARIS_TRACE=1` で trace ログを出す（`SIGMARIS_TRACE_TEXT=1` で本文プレビューも出す）

## 1ターンの流れ（PersonaController）

- `sigmaris_core/persona_core/controller/persona_controller.py`
  - `handle_turn(...)` が「人格OSの 1ターン」を担当

処理順（概略）:
1. **Memory**: `MemoryOrchestrator` で関連記憶を選ぶ
2. **Identity**: `IdentityContinuityEngineV3` で「今回の話題ラベル/継続性」を作る
3. **Value drift**: `ValueDriftEngine` が `ValueState` を更新（Safety/Reward/Memory の影響を反映）
4. **Trait drift**: `TraitDriftEngine` が `TraitState` を更新（感情シグナル等で変化）
5. **Global FSM**: `GlobalStateMachine` がモード（NORMAL/REFLECTIVE/…）を決定
6. **LLM generate**: `OpenAILLMClient.generate(...)` が system prompt を組み、返答を生成
7. **Store**: EpisodeStore / PersonaDB に保存（可能な範囲で）

trace:
- `PersonaRequest.metadata["_trace_id"]` があると `persona_controller.*` のログが出ます。

## 記憶（MemoryOrchestrator）

- `sigmaris_core/persona_core/memory/memory_orchestrator.py`
  - `SelectiveRecall`（embedding 類似）→ `AmbiguityResolver`（曖昧性処理）→ `EpisodeMerger`（要約）のパイプライン

## LLM / Embedding

- `sigmaris_core/persona_core/llm/openai_llm_client.py`
  - `generate(...)`（返答生成）
  - `encode(...)` / `similarity(...)`（embedding・類似度）

## 安全（SafetyLayer）

- `sigmaris_core/persona_core/safety/safety_layer.py`
  - `assess(...)` が `safety_flag`（None/intervened/escalated/blocked）を返す
  - `server_persona_os.py` では「外側で簡易判定→controllerへ渡す」方式

## 永続化について（重要）

`server_persona_os.py` は **デモ優先**で、EpisodeStore/PersonaDB を in-memory 実装にしています。
永続化したい場合は、以下のどれを正にするか決めて置き換えるのが安全です。

- `persona_core/memory/episode_store.py`（JSON）
- `persona_core/memory/episode_store_sqlite.py`（SQLite）
- （将来）Postgres/Supabase に保存するストレージ層を追加（推奨）
