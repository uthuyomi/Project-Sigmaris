import { StateContext, SigmarisState } from "../StateContext";
import { IntrospectionEngine } from "@/engine/IntrospectionEngine";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";

export class IntrospectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const introspector = new IntrospectionEngine();
    const meta = new MetaReflectionEngine();

    const ires = await introspector.run(ctx.output, ctx.traits);
    const mres = await meta.run(ires, ctx.traits);

    ctx.output = mres.output ?? ctx.output;
    ctx.traits = mres.updatedTraits ?? ctx.traits;
    ctx.reflectCount = 0;

    return "Dialogue";
  }
}
