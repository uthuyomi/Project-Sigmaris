import { StateContext, SigmarisState } from "../StateContext";

export class SafetyModeState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    ctx.output =
      "安全モードに切り替えています。しばらく落ち着いた内容で続けましょう。";

    // Trait固定
    ctx.traits = ctx.traits;

    return "Idle";
  }
}
