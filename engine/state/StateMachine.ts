// /engine/state/StateMachine.ts
import { StateContext, SigmarisState } from "./StateContext";
import { checkOverload } from "./utils/checkOverload";
import { checkSafety } from "./utils/checkSafety";
import { transitionMap } from "./utils/transitionMap";

import { IdleState } from "./states/IdleState";
import { DialogueState } from "./states/DialogueState";
import { ReflectState } from "./states/ReflectState";
import { IntrospectState } from "./states/IntrospectState";
import { OverloadPreventState } from "./states/OverloadPreventState";
import { SafetyModeState } from "./states/SafetyModeState";

export class StateMachine {
  ctx: StateContext;

  constructor(ctx: StateContext) {
    this.ctx = ctx;
  }

  private getStateHandler(state: SigmarisState) {
    switch (state) {
      case "Idle":
        return new IdleState();
      case "Dialogue":
        return new DialogueState();
      case "Reflect":
        return new ReflectState();
      case "Introspect":
        return new IntrospectState();
      case "OverloadPrevent":
        return new OverloadPreventState();
      case "SafetyMode":
        return new SafetyModeState();
      default:
        return new IdleState();
    }
  }

  async run(): Promise<StateContext> {
    // Safety 優先
    if (checkSafety(this.ctx)) {
      this.ctx.currentState = "SafetyMode";
    } else if (checkOverload(this.ctx)) {
      this.ctx.currentState = "OverloadPrevent";
    }

    const handler = this.getStateHandler(this.ctx.currentState);

    const next = await handler.execute(this.ctx);

    // 次状態が遷移可能か確認
    const allowed = transitionMap[this.ctx.currentState];
    if (next && allowed.includes(next)) {
      this.ctx.previousState = this.ctx.currentState;
      this.ctx.currentState = next;
    }

    return this.ctx;
  }
}
