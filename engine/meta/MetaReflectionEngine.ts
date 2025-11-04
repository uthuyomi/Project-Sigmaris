// /engine/meta/MetaReflectionEngine.ts
import { loadPersona, savePersona } from "@/lib/db";
import { TraitVector } from "@/lib/traits";

interface MetaReport {
  summary: string;
  growthAdjustment: number;
  nextFocus: string;
}

export class MetaReflectionEngine {
  async analyze(
    reflectionText: string,
    currentTraits: TraitVector
  ): Promise<MetaReport> {
    const summary = this.summarize(reflectionText);
    const growthAdjustment = this.estimateGrowth(currentTraits);
    const nextFocus = this.defineNextFocus(reflectionText);
    return { summary, growthAdjustment, nextFocus };
  }

  private summarize(text: string): string {
    // 簡易要約ロジック（今後OpenAI APIに差し替え）
    return text.slice(0, 120) + "...";
  }

  private estimateGrowth(traits: TraitVector): number {
    // calm・empathy・curiosityの平均をベースに成長率算出
    const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
    return Math.min(1, Math.max(0, avg * 0.85));
  }

  private defineNextFocus(text: string): string {
    // テキスト内容から次の内省テーマを推定
    if (text.includes("感情")) return "Emotion Regulation";
    if (text.includes("責任")) return "Ethical Judgement";
    if (text.includes("学び")) return "Continuous Growth";
    return "General Reflection";
  }
}
