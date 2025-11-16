import { StateContext, SigmarisState } from "../StateContext";

export class DialogueState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    // 通常対話 → Reflectへ
    return "Reflect";
  }
}
