# gensokyo-world-docs

AI幻想郷ワールド（Time Skip Simulation中心）の設計メモ。

実装の対応フォルダ:

- サーバ実装: `gensokyo-world-engine/`
- WSゲートウェイ: `gensokyo-event-gateway/`
- DBスキーマ: `supabase/GENSOKYO_WORLD_SCHEMA.sql`

## 読む順番（推奨）

1. `ai-gensokyo-world-design.md`（全体像）
2. `00_stack_and_phased_architecture.md`（導入順・ライブラリの使いどころ）
3. `01_supabase_schema_ai_gensokyo.md`（DB）
4. `02_event_generation_engine.md`（イベント生成）
5. `03_npc_behavior_planner.md`（NPC行動）
6. `04_scalability_and_simulation_architecture.md`（スケール）

## 実装で迷ったら読む（用途別）

- データの形を固定したい: `05_domain_models_and_data_specs.md`
- APIのI/Oを固定したい: `06_api_contracts_world_layer.md`
- プロンプトの部品: `07_prompt_templates.md`
- テスト観点/破綻検知: `08_checklists_and_test_plan.md`
- 素材（場所/キャラ/イベント）の作り方: `09_content_authoring_playbook.md`
- Time Skipの核（invariants/tick）: `10_world_engine_invariants_and_tick.md`
- DB適用/seed/ローカル起動: `11_migrations_seeding_and_local_dev.md`
- 既存UIへの統合: `12_integration_with_touhou_talk_ui.md`
- 運用/コスト/観測: `13_observability_and_cost_tuning.md`
- 品質チェック用プロンプト集: `14_prompt_regression_suite.md`
- 2D→3Dへ段階移行: `15_3d_migration_path.md`
- リアルタイム（WS）イベントゲートウェイ: `16_realtime_event_gateway_ws.md`
- ユーザー介入（Command Bus）: `17_command_bus_and_user_interactions.md`
- Relation/記憶/自律シム: `18_character_relations_scoped_memory_and_simulation.md`

## 方針（短縮版）

- リアルタイム常時計算をしない（Time Skip）
- 行動決定はルール（FSM/BT）
- LLMは会話/要約に限定

## world_id 命名規約（方針確定）

- 本番メイン: `gensokyo_main`
- テスト: `gensokyo_test`
- シャード: `gensokyo_shard_01`, `gensokyo_shard_02`, ...
