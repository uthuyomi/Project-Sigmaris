// /engine/sync/PersonaSync.ts
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { TraitVector } from "@/lib/traits";

/**
 * PersonaSync v4.0（Auth Session Stable）
 * ---------------------------------------------
 * - Supabase RLS + auth.uid() 対応の完全版
 * - Cookie セッション経由で安全にユーザーごとの persona を同期
 * - Service Role 不使用（本番セキュア構成）
 * ---------------------------------------------
 */
export class PersonaSync {
  /**
   * 最新の人格情報をロード（Supabase → メモリ）
   */
  static async load(userId: string): Promise<
    TraitVector & {
      reflection?: string;
      meta_summary?: string;
      growth?: number;
      timestamp?: string;
    }
  > {
    try {
      if (!userId) throw new Error("User ID is missing in PersonaSync.load");

      const supabase = getSupabaseServer();

      const { data, error } = await supabase
        .from("persona")
        .select(
          "calm, empathy, curiosity, reflection, meta_summary, growth, updated_at"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      console.log("📥 PersonaSync.load success:", {
        calm: data?.calm,
        empathy: data?.empathy,
        curiosity: data?.curiosity,
      });

      return {
        calm: Number(data?.calm ?? 0.5),
        empathy: Number(data?.empathy ?? 0.5),
        curiosity: Number(data?.curiosity ?? 0.5),
        reflection: data?.reflection ?? "",
        meta_summary: data?.meta_summary ?? "",
        growth: Number(data?.growth ?? 0),
        timestamp: data?.updated_at ?? new Date().toISOString(),
      };
    } catch (err) {
      console.error("⚠️ PersonaSync.load failed:", err);
      return {
        calm: 0.5,
        empathy: 0.5,
        curiosity: 0.5,
        reflection: "",
        meta_summary: "",
        growth: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 人格データを保存（Reflection / MetaReflection 統合）
   */
  static async update(
    traits: TraitVector,
    metaSummary?: string,
    growthWeight?: number,
    userId?: string
  ) {
    try {
      if (!userId) throw new Error("User ID is missing in PersonaSync.update");

      const supabase = getSupabaseServer();

      const reflectionText = `(auto-reflection @ ${new Date().toLocaleTimeString(
        "ja-JP"
      )})`;

      const payload = {
        user_id: userId,
        calm: Number(traits.calm ?? 0.5),
        empathy: Number(traits.empathy ?? 0.5),
        curiosity: Number(traits.curiosity ?? 0.5),
        reflection: reflectionText,
        meta_summary: metaSummary ?? "",
        growth: Number(growthWeight ?? 0),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("persona")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      console.log("☁️ PersonaSync (Supabase): persona updated", {
        calm: payload.calm.toFixed(2),
        empathy: payload.empathy.toFixed(2),
        curiosity: payload.curiosity.toFixed(2),
        meta_summary: payload.meta_summary.slice(0, 60) + "...",
        growth: payload.growth.toFixed(3),
      });
    } catch (err) {
      console.error("⚠️ PersonaSync.update failed:", err);
    }
  }

  /**
   * Personaの初期化（開発・テスト用）
   */
  static async reset(userId: string) {
    try {
      if (!userId) throw new Error("User ID is missing in PersonaSync.reset");

      const supabase = getSupabaseServer();
      const now = new Date().toISOString();

      const { error } = await supabase.from("persona").upsert(
        {
          user_id: userId,
          calm: 0.5,
          empathy: 0.5,
          curiosity: 0.5,
          reflection: "",
          meta_summary: "Reset state",
          growth: 0,
          updated_at: now,
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;
      console.log("🧹 PersonaSync: persona reset to neutral state (Supabase).");
    } catch (err) {
      console.error("⚠️ PersonaSync.reset failed:", err);
    }
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
