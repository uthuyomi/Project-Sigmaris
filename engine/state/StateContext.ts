// /engine/state/StateContext.ts
import { Trait } from "@/types/trait";
import { SafetyReport } from "@/types/safety";

export type SigmarisState =
  | "Idle"
  | "Dialogue"
  | "Reflect"
  | "Introspect"
  | "OverloadPrevent"
  | "SafetyMode";

export interface StateContext {
  // 入出力
  input: string;
  output: string;

  // 状態
  currentState: SigmarisState;
  previousState: SigmarisState | null;

  // トレイト
  traits: Trait;

  // 連続評価
  reflectCount: number;
  tokenUsage: number;

  // SafetyLayer の結果
  safety: SafetyReport | null;

  // Timestamp
  timestamp: number;

  // 汎用メタデータ
  meta: Record<string, any>;
}

export function createInitialContext(): StateContext {
  return {
    input: "",
    output: "",
    currentState: "Idle",
    previousState: null,
    traits: { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
    reflectCount: 0,
    tokenUsage: 0,
    safety: null,
    timestamp: Date.now(),
    meta: {},
  };
}
