# Update Rules（Relationship / Memory 更新規則）

本ドキュメントは 1ターンごとの更新規則（スムージング、クリップ、閾値）を定義します。

## 1. Relationship 更新（毎ターン）

前提:

- `trust` は **[-1, 1]**（負方向を許容）
- `familiarity` は **[0, 1]**

手順（概念）:

1. `/persona/relationship/score` から `delta` と `confidence` を取得
2. `confidence < threshold` なら更新しない
3. `delta` をステップ係数で縮小し、最大変化量でクリップ
4. EMA（指数移動平均）で滑らかに反映（「急に態度が変わる」を防止）

実装上の式（要点）:

- `dTrust = clip(delta.trust * TRUST_STEP, ±TRUST_MAX_DELTA)`
- `dFam = clip(delta.familiarity * FAMILIARITY_STEP, ±FAMILIARITY_MAX_DELTA)`
- `trust = clamp(trust + EMA_ALPHA * dTrust, -1, 1)`
- `familiarity = clamp(familiarity + EMA_ALPHA * dFam, 0, 1)`

## 2. Memory 更新（必要時のみ）

- `memory.*_add` が空なら更新しない
- 既存配列に **ユニークマージ**して追加
- 配列上限は 48 要素（古いものを優先的に落とす/末尾維持）

## 3. 環境変数（チューニング）

UI（`touhou-talk-ui`）側で調整できるパラメータ:

- `TOUHOU_RELATIONSHIP_ENABLED`（default: `true`）
- `TOUHOU_RELATIONSHIP_CONFIDENCE_THRESHOLD`（default: `0.55`）
- `TOUHOU_RELATIONSHIP_EMA_ALPHA`（default: `0.15`）
- `TOUHOU_RELATIONSHIP_TRUST_STEP`（default: `0.02`）
- `TOUHOU_RELATIONSHIP_FAMILIARITY_STEP`（default: `0.02`）
- `TOUHOU_RELATIONSHIP_TRUST_MAX_DELTA`（default: `0.02`）
- `TOUHOU_RELATIONSHIP_FAMILIARITY_MAX_DELTA`（default: `0.03`）

設計意図:

- スコアは毎ターン出すが、**更新は常に微小**にする
- 自信がないターン（薄い挨拶等）では **関係が動かない**ようにする

