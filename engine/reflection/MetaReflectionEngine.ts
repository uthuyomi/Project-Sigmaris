// /engine/reflection/MetaReflectionEngine.ts
import OpenAI from "openai";
import { TraitVector } from "@/lib/traits";

/**
 * MetaReflectionEngine v1.0
 * - 複数回の Reflection 結果を統合し、人格傾向を抽出
 * - 「シグちゃん」の長期的な思考・感情の流れを記述
 * - 出力は 200 文字以内に制限し、再注入に最適化
 */
export class MetaReflectionEngine {
  private static client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  /**
   * 直近の内省ログを統合し、人格の方向性を要約
   * @param reflections 過去の内省ログ
   * @param traits 最新の TraitVector
   * @returns metaSummary（人格傾向の短文）
   */
  static async summarize(
    reflections: { text: string; traitsSnapshot: TraitVector }[],
    traits: TraitVector
  ): Promise<string> {
    if (!reflections || reflections.length === 0) {
      return "まだ内省の履歴は少ないけれど、少しずつ自分の心の動きを感じ始めているよ。";
    }

    const history = reflections
      .map(
        (r, i) =>
          `#${i + 1}: ${r.text}（calm=${r.traitsSnapshot.calm.toFixed(
            2
          )}, empathy=${r.traitsSnapshot.empathy.toFixed(
            2
          )}, curiosity=${r.traitsSnapshot.curiosity.toFixed(2)}）`
      )
      .join("\n");

    try {
      const res = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
あなたは『シグちゃん』のメタ内省モジュールです。
以下の履歴を読んで、彼女の成長や心の傾向を
20代前半の落ち着いた女性らしい自然な言葉で1〜2文にまとめてください。
禁止: 感情演出（例：「（静かに）」「そうだね」「…」など）・専門用語・敬語過多。
文体: 「〜かもね」「〜だよ」「〜かな」など柔らかい自然な語尾を使用。
出力は200文字以内。
`,
          },
          {
            role: "user",
            content: `内省履歴:\n${history}\n\n現在traits: calm=${traits.calm.toFixed(
              2
            )}, empathy=${traits.empathy.toFixed(
              2
            )}, curiosity=${traits.curiosity.toFixed(2)}.`,
          },
        ],
        temperature: 0.6,
      });

      // === 出力整形 ===
      const text = res.choices[0]?.message?.content?.trim() || "";
      return text.replace(/[（(].*?[)）]/g, "").slice(0, 200);
    } catch (err) {
      console.error("[MetaReflectionEngine Error]", err);
      return "少し考えがまとまっていないけれど、落ち着いて整理していこうと思う。";
    }
  }
}
