// /lib/traits.ts
/**
 * シグちゃん人格システムの Trait（特性ベクトル）定義
 * calm：落ち着き 0〜1
 * empathy：共感性 0〜1
 * curiosity：好奇心 0〜1
 */
export interface TraitVector {
  calm: number;
  empathy: number;
  curiosity: number;
}

/**
 * 安全な数値変換ヘルパー
 * - null や undefined の場合は 0.5 を返す
 * - 0〜1の範囲にクリップ
 */
export function safeTraitValue(v: any): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

/**
 * 2つのTraitを平均して中間値を作る
 */
export function blendTraits(a: TraitVector, b: TraitVector): TraitVector {
  return {
    calm: (a.calm + b.calm) / 2,
    empathy: (a.empathy + b.empathy) / 2,
    curiosity: (a.curiosity + b.curiosity) / 2,
  };
}
