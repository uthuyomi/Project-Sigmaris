// /engine/sync/PersonaSync.ts
import { loadPersona, savePersona } from "@/lib/db";
import { TraitVector } from "@/lib/traits";

/**
 * PersonaSync v2.2
 * - PersonaDB（SQLite）との双方向同期を担当
 * - ReflectionEngine / MetaReflectionEngine と連携
 * - SafetyLayer適用後の人格値＋メタ内省を永続化
 * - 再注入フェーズ対応
 */
export class PersonaSync {
  /** 最新の人格情報をロード（DB → メモリ） */
  static load(): TraitVector & {
    reflection?: string;
    meta_summary?: string;
    growth?: number;
    timestamp?: string;
  } {
    const row = loadPersona();
    return {
      calm: row?.calm ?? 0.5,
      empathy: row?.empathy ?? 0.5,
      curiosity: row?.curiosity ?? 0.5,
      reflection: row?.reflection ?? "",
      meta_summary: row?.meta_summary ?? "",
      growth: row?.growth ?? 0,
      timestamp: row?.timestamp ?? new Date().toISOString(),
    };
  }

  /**
   * 人格データを保存（Reflection / MetaReflection 統合）
   * @param traits 現在のTraitベクトル
   * @param metaSummary 最新のメタ内省（人格傾向）
   * @param growthWeight 学習重み
   */
  static update(
    traits: TraitVector,
    metaSummary?: string,
    growthWeight?: number
  ) {
    // 🔹 metaSummary と reflectionText を安全に保存
    const reflectionText =
      "(auto-reflection updated at " +
      new Date().toLocaleTimeString("ja-JP") +
      ")";

    savePersona({
      calm: traits.calm,
      empathy: traits.empathy,
      curiosity: traits.curiosity,
      reflectionText,
      metaSummary: metaSummary ?? "",
      growthWeight: growthWeight ?? 0,
    });

    console.log("💾 PersonaSync: persona updated", {
      calm: traits.calm.toFixed(2),
      empathy: traits.empathy.toFixed(2),
      curiosity: traits.curiosity.toFixed(2),
      metaSummary: metaSummary?.slice(0, 80) ?? "(none)",
      growthWeight,
    });
  }

  /**
   * Personaの初期化（開発・テスト用）
   */
  static reset() {
    savePersona({
      calm: 0.5,
      empathy: 0.5,
      curiosity: 0.5,
      reflectionText: "",
      metaSummary: "Reset state",
      growthWeight: 0,
    });
    console.log("🧹 PersonaSync: persona reset to neutral state.");
  }

  /**
   * Persona値のマージ（前回値と現在値の平均）
   */
  static merge(
    prev: TraitVector,
    next: TraitVector,
    weight = 0.5
  ): TraitVector {
    return {
      calm: prev.calm * (1 - weight) + next.calm * weight,
      empathy: prev.empathy * (1 - weight) + next.empathy * weight,
      curiosity: prev.curiosity * (1 - weight) + next.curiosity * weight,
    };
  }
}
