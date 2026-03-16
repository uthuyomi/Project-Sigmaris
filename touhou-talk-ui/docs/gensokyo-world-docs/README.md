# gensokyo-world-docs

AI 幻想郷ワールド（Time Skip Simulation 中心）の設計メモです。

実装の対応フォルダは以下です。

- サーバ実装: `gensokyo-world-engine/`
- WS ゲートウェイ: `gensokyo-event-gateway/`
- DB スキーマ: `supabase/GENSOKYO_WORLD_SCHEMA.sql`

## 読む順番（推奨）

1. `ai-gensokyo-world-design.md`（全体像）
2. `00_stack_and_phased_architecture.md`（導入順・ライブラリの使いどころ）
3. `01_supabase_schema_ai_gensokyo.md`（DB）
4. `02_event_generation_engine.md`（イベント生成）
5. `03_npc_behavior_planner.md`（NPC 行動）
6. `04_scalability_and_simulation_architecture.md`（スケール）

## 実装で迷った場合（用途別）

- データの形を固定したい場合: `05_domain_models_and_data_specs.md`
- API の I/O を固定したい場合: `06_api_contracts_world_layer.md`
- プロンプトの部品を参照したい場合: `07_prompt_templates.md`
- テスト観点/破綻検知を整理したい場合: `08_checklists_and_test_plan.md`
- 素材（場所/キャラ/イベント）を作る場合: `09_content_authoring_playbook.md`
- Time Skip の核（invariants/tick）を確認したい場合: `10_world_engine_invariants_and_tick.md`
- DB 適用/seed/ローカル起動の手順: `11_migrations_seeding_and_local_dev.md`
- 既存 UI への統合: `12_integration_with_touhou_talk_ui.md`
- 運用/コスト/観測: `13_observability_and_cost_tuning.md`
- 品質チェック用プロンプト集: `14_prompt_regression_suite.md`
- 2D→3D への段階移行: `15_3d_migration_path.md`
- リアルタイム（WS）イベントゲートウェイ: `16_realtime_event_gateway_ws.md`
- ユーザー介入（Command Bus）: `17_command_bus_and_user_interactions.md`
- Relation/記憶/自律シム: `18_character_relations_scoped_memory_and_simulation.md`

## 方針（短縮版）

- リアルタイム常時計算は行いません（Time Skip）
- 行動決定はルール（FSM/BT）を中心に設計します
- LLM は会話/要約に限定します

## world_id 命名規約

- 本番メイン: `gensokyo_main`
- テスト: `gensokyo_test`
- シャード: `gensokyo_shard_01`, `gensokyo_shard_02`, ...
