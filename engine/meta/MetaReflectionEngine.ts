// /engine/meta/MetaReflectionEngine.ts
import OpenAI from "openai";
import type { TraitVector } from "@/lib/traits";

/**
 * === MetaReport 型定義 ===
 * ReflectionEngine などから参照される外部公開インターフェース
 */
export interface MetaReport {
  summary: string; // 要約されたメタ内省
  growthAdjustment: number; // 成長重み（0〜1）
  nextFocus: string; // 次のテーマ
  traits?: TraitVector; // ReflectionEngine 連携用
  reasoning?: string; // 成長方向の理由（任意）
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * MetaReflectionEngine
 * - ReflectionEngine から呼び出される
 * - 内省文・traits・summary を統合して解析
 */
export class MetaReflectionEngine {
  /**
   * メイン解析関数
   * @param reflectionText 内省テキスト
   * @param currentTraits 現在のtraitベクトル
   * @param summary 過去のsummary（任意／前文脈として渡す）
   */
  async analyze(
    reflectionText: string,
    currentTraits: TraitVector,
    summary?: string
  ): Promise<MetaReport> {
    try {
      // === Step 1: 入力統合 ===
      const contextBlock = [
        summary && summary.trim().length > 0
          ? `【過去の要約】\n${summary}`
          : "",
        `【現在の内省】\n${reflectionText}`,
        `【Traits】 calm=${currentTraits.calm.toFixed(
          2
        )}, empathy=${currentTraits.empathy.toFixed(
          2
        )}, curiosity=${currentTraits.curiosity.toFixed(2)}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      // === Step 2: LLM解析 ===
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris' meta-reflection module. Summarize past and current reflections to detect gradual personality evolution.",
          },
          {
            role: "user",
            content: `
統合された内省データをもとに、AI人格の進化傾向をJSONで出力してください。
必ず以下の形式で出力：
{
  "summary": "統合的要約文（過去と現在の流れを踏まえたもの）",
  "growthAdjustment": 0.xx,
  "nextFocus": "次に意識すべきテーマ",
  "reasoning": "なぜその成長が起きたのかの理由を一文で"
}

${contextBlock}
`,
          },
        ],
        temperature: 0.5,
      });

      const raw = res.choices[0]?.message?.content ?? "";
      const block = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
      const jsonText = block ?? raw;

      let parsed: any = null;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        parsed = { summary: raw.trim() };
      }

      // === Step 3: traits再付与・フォールバック ===
      const summaryFinal =
        parsed.summary || this.fallbackSummarize(reflectionText);
      const growthAdjustment =
        typeof parsed.growthAdjustment === "number"
          ? parsed.growthAdjustment
          : this.estimateGrowth(currentTraits);

      const nextFocus =
        parsed.nextFocus || this.defineNextFocus(reflectionText);
      const reasoning = parsed.reasoning || "";

      // === Step 4: 出力統合 ===
      return {
        summary: summaryFinal,
        growthAdjustment,
        nextFocus,
        reasoning,
        traits: currentTraits,
      };
    } catch (err: any) {
      console.error("[MetaReflectionEngine.analyze Error]", err);
      return {
        summary: "（エラーにより要約できませんでした）",
        growthAdjustment: 0,
        nextFocus: "Stability Maintenance",
        traits: currentTraits,
      };
    }
  }

  /** === 簡易フォールバック要約 === */
  private fallbackSummarize(text: string): string {
    return text.length > 120 ? text.slice(0, 120) + "..." : text;
  }

  /** === 成長率推定 === */
  private estimateGrowth(traits: TraitVector): number {
    const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
    const dist = Math.abs(avg - 0.5);
    return Math.min(1, 0.5 + dist);
  }

  /** === 次の内省テーマ推定 === */
  private defineNextFocus(text: string): string {
    const lower = text.toLowerCase();
    if (/emotion|感情/.test(lower)) return "Emotion Regulation";
    if (/responsibility|責任|判断/.test(lower)) return "Ethical Judgement";
    if (/learn|学|改善/.test(lower)) return "Continuous Growth";
    if (/relationship|関係|他者/.test(lower)) return "Empathy & Communication";
    return "General Reflection";
  }
}
