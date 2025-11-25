// /engine/state/states/IntrospectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { IntrospectionEngine } from "@/engine/IntrospectionEngine";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import type { TraitVector } from "@/lib/traits";

/**
 * IntrospectState v2.6
 * ----------------------------------------------
 * ・ReflectionState の summary をもとに deeper check（階層2）
 * ・Self-Referent の結果を利用して introspection 深度を動的変更
 * ・MetaReflectionEngine で人格軌道（identity continuity）に寄与
 * ・TraitVector を安全にマージ
 * ・最終的に "Idle" へ戻す
 */
export class IntrospectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const introspector = new IntrospectionEngine();
    const meta = new MetaReflectionEngine();

    /* ---------------------------------------------
     * 0) Emotion fallback（念のため）
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * 1) Self-Referent に基づく introspection depth 設定
     * --------------------------------------------- */
    let depthHint: "self" | "user" | "third" | "neutral" = "neutral";

    if (ctx.self_ref) {
      const r = ctx.self_ref;
      if (r.target === "self" && r.confidence > 0.6) depthHint = "self";
      else if (r.target === "user" && r.confidence > 0.4) depthHint = "user";
      else if (r.target === "third") depthHint = "third";
    }

    /* ---------------------------------------------
     * 2) IntrospectionEngine 実行（階層2）
     * --------------------------------------------- */
    let ires: { output: string; updatedTraits: TraitVector };

    try {
      const res = await introspector.run(ctx.meta.reflection, ctx.traits, {
        depth: depthHint,
      });

      ires = {
        output: res.output ?? ctx.meta.reflection ?? "",
        updatedTraits: res.updatedTraits ?? ctx.traits,
      };
    } catch (err) {
      console.error("[IntrospectState] introspection failed:", err);
      ires = {
        output: ctx.meta.reflection ?? "",
        updatedTraits: ctx.traits,
      };
    }

    /* ---------------------------------------------
     * 3) Meta-ReflectionEngine 実行（階層3）
     * --------------------------------------------- */
    let mres: { output: string; updatedTraits: TraitVector };

    try {
      const res = await meta.run(
        {
          output: ires.output,
          updatedTraits: ires.updatedTraits,
        },
        ctx.traits,
        {
          selfReferent: ctx.self_ref,
          depth: depthHint,
          reflectCount: ctx.reflectCount,
        }
      );

      mres = {
        output: res.output ?? ires.output,
        updatedTraits: res.updatedTraits ?? ctx.traits,
      };
    } catch (err) {
      console.error("[IntrospectState] meta-reflection failed:", err);
      mres = {
        output: ires.output,
        updatedTraits: ctx.traits,
      };
    }

    /* ---------------------------------------------
     * 4) 内部サマリー保存（UI 向け）
     * --------------------------------------------- */
    ctx.meta.introspection = ires.output;
    ctx.meta.metaReflection = mres.output;

    /* ---------------------------------------------
     * 5) Traits の安全マージ（人格変動）
     * --------------------------------------------- */
    ctx.traits = {
      calm: Number(mres.updatedTraits.calm.toFixed(4)),
      empathy: Number(mres.updatedTraits.empathy.toFixed(4)),
      curiosity: Number(mres.updatedTraits.curiosity.toFixed(4)),
    };

    ctx.reflectCount = 0;

    /* ---------------------------------------------
     * 6) Emotion modulation（階層3後の安定）
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.72)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.02)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.9)),
    };

    /* ---------------------------------------------
     * 7) 次ステップ — Idle
     * --------------------------------------------- */
    return "Idle";
  }
}
