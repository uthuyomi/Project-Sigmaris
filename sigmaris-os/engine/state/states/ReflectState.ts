// /engine/state/states/ReflectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { ReflectionEngine } from "@/engine/ReflectionEngine";

/**
 * ReflectState v2.4
 * ------------------------------
 * ・DialogueState の返答をもとに軽量内省を実行
 * ・Self-Referent 結果を反映し、反省深度を自然調整
 * ・結果は ctx.output ではなく ctx.meta.reflection に格納
 * ・StateMachine → 次ステップは "Introspect"
 */
export class ReflectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const engine = new ReflectionEngine();

    /* ---------------------------------------------
     * 0) Emotion fallback（念のため）
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * 1) Self-Referent に応じた Reflect 深度調整
     * --------------------------------------------- */
    let depthHint = "";

    if (ctx.self_ref) {
      const ref = ctx.self_ref;

      if (ref.target === "self" && ref.confidence > 0.6) {
        depthHint =
          "ユーザーは今回、あなた（シグちゃん）本人について問うている。";
      } else if (ref.target === "user") {
        depthHint = "この発話はユーザー自身の状態に焦点がある。";
      } else if (ref.target === "third") {
        depthHint = "第三者についての発話が中心。";
      } else {
        depthHint = "発話対象は特定できない。";
      }
    }

    /* ---------------------------------------------
     * 2) ReflectionEngine に渡すダイアログ構造を組み立て
     * --------------------------------------------- */
    const historyBlock = [
      {
        user: ctx.input,
        ai: ctx.output, // DialogueState の返答
      },
    ];

    // SelfReferent のヒントもエンジン側で利用できるようメタ付加
    const metaInfo = {
      selfReferent: ctx.self_ref ?? null,
      depthHint,
    };

    /* ---------------------------------------------
     * 3) ReflectionEngine 実行
     * --------------------------------------------- */
    let summary = "";

    try {
      summary = await engine.reflect(
        [], // growthLog（v1 は未使用）
        historyBlock,
        metaInfo // ← 新しく渡せるように ReflectionEngine 側も対応済み前提
      );
    } catch (err) {
      console.error("[ReflectState] ReflectionEngine error:", err);
      summary = "（内省処理に失敗したため、簡易要約を返します）";
    }

    /* ---------------------------------------------
     * 4) Reflect 結果は ctx.output ではなくメタ領域に保存
     * --------------------------------------------- */
    ctx.meta.reflection = summary;
    ctx.reflectCount++;

    /* ---------------------------------------------
     * 5) Emotion 揺らぎ（Reflect 後に少し落ち着く）
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.82)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.015)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.88)),
    };

    /* ---------------------------------------------
     * 6) 次ステップ — Introspect（仕様固定）
     * --------------------------------------------- */
    return "Introspect";
  }
}
