// /engine/state/utils/transitionMap.ts
import { SigmarisState } from "../StateContext";

export const transitionMap: Record<SigmarisState, SigmarisState[]> = {
  Idle: ["Dialogue", "SafetyMode"],

  Dialogue: ["Reflect", "OverloadPrevent", "SafetyMode"],

  Reflect: ["Introspect", "SafetyMode"],

  Introspect: ["Dialogue", "SafetyMode"],

  OverloadPrevent: ["Dialogue", "SafetyMode"],

  SafetyMode: ["Idle"],
};
