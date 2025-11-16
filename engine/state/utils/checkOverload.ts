// /engine/state/utils/checkOverload.ts
import { StateContext } from "../StateContext";

export function checkOverload(ctx: StateContext): boolean {
  const { traits, reflectCount, tokenUsage, safety } = ctx;

  const isCalmLow = traits.calm < 0.38;
  const tooManyReflects = reflectCount >= 3;
  const tokensOver = tokenUsage > 2000;
  const safetyAbstraction = safety?.flags?.abstractionOverload === true;

  return isCalmLow || tooManyReflects || tokensOver || safetyAbstraction;
}
