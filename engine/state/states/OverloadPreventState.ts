import { StateContext, SigmarisState } from "../StateContext";

export class OverloadPreventState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    ctx.output =
      "（負荷調整モード）\n一旦ゆっくり処理しています。少し軽めに話しかけてください。";

    // calmをゆっくり回復
    ctx.traits.calm = Math.min(1, ctx.traits.calm + 0.05);

    // 負荷が取れたら Dialogueへ戻す
    if (ctx.traits.calm > 0.45) return "Dialogue";

    return "OverloadPrevent";
  }
}
