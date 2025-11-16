// /engine/state/states/ReflectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { ReflectionEngine } from "@/engine/ReflectionEngine";

export class ReflectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const engine = new ReflectionEngine();

    // StateMachine では growthLog / dialogue / summary / userId は不要
    // → 軽量 reflect() を使用して "summary" を取得
    const summary = await engine.reflect(
      [],
      [
        {
          user: ctx.input,
          ai: ctx.output,
        },
      ]
    );

    // ReflectState の責務：ctx.output に summary を入れる
    ctx.output = summary;
    ctx.reflectCount++;

    return "Introspect";
  }
}
