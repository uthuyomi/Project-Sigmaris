// /engine/pipeline/PreProcess.ts

import { StateContext } from "@/engine/state/StateContext";
import { SelfReferentModule } from "@/engine/self/selfReferent";
// SafetyLayer 将来拡張用（コメントアウトのまま残す）
// import { SafetyLayer } from "@/engine/safety/SafetyLayer";

/**
 * PreProcessPipeline
 * ------------------------------------------------------
 * StateMachine に渡す「直前の整形済みコンテキスト」を作る。
 *  - 入力正規化
 *  - 自己参照モジュール（SelfReferent）
 *  - （将来）安全性の一次チェック
 * ------------------------------------------------------
 */
export class PreProcessPipeline {
  /**
   * === run(): 前処理の全体 ===
   */
  static run(ctx: StateContext): StateContext {
    // 入力正規化
    const normalized = this.normalize(ctx.input);
    ctx.input = normalized;

    // ----------------------------------------------
    // 🔍 Self-Referent（自己参照）診断
    // ----------------------------------------------
    try {
      const selfRef = SelfReferentModule.analyze(normalized);
      ctx.self_ref = selfRef ?? null;
    } catch (err) {
      console.error("❌ [PreProcess] SelfReferent analyze failed:", err);
      ctx.self_ref = null;
    }

    // ----------------------------------------------
    // 🔐 SafetyLayer（将来的にここで一次チェック可能）
    // ----------------------------------------------
    // try {
    //   ctx.safety = SafetyLayer.checkText(normalized);
    // } catch (err) {
    //   console.error("❌ [PreProcess] SafetyLayer error:", err);
    // }

    // タイムスタンプ更新
    ctx.timestamp = Date.now();

    return ctx;
  }

  /**
   * === normalize(): テキスト正規化 ===
   * - 前後の空白除去
   * - Unicode揺れが必要なら後で追加拡張できる
   */
  private static normalize(text: string): string {
    if (!text) return "";
    return text.trim();
  }
}
