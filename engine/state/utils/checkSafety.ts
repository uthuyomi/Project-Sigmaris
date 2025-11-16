// /engine/state/utils/checkSafety.ts
import { StateContext } from "../StateContext";

export function checkSafety(ctx: StateContext): boolean {
  const s = ctx.safety;

  if (!s) return false;

  return (
    s.flags.selfReference || s.flags.loopSuspect || s.flags.abstractionOverload
  );
}
