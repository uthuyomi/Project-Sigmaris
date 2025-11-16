import { StateContext, SigmarisState } from "../StateContext";

export class IdleState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    if (!ctx.input.trim()) return "Idle";
    return "Dialogue";
  }
}
