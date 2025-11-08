// /engine/ReflectionEngine.ts
import OpenAI from "openai";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import { EmotionSynth } from "@/engine/emotion/EmotionSynth";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";

/**
 * Persona構造体（スキーマ参照用）
 */
interface Persona {
  calm: number;
  empathy: number;
  curiosity: number;
  reflection?: string;
  meta_summary?: string;
  growth?: number;
  timestamp?: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** 安全に数値を取得 */
function firstFiniteNumber(
  ...candidates: Array<number | undefined | null>
): number | undefined {
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

/** LLM出力からJSONを抽出（```json ブロック優先） */
function tryParseJSONLoose(text: string): any | null {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = block ?? text;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  const raw = objMatch ? objMatch[0] : candidate;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** LLMが大きく振ってきたときの保険（±maxDelta内に抑える） */
function clampDeltaAround(
  base: number,
  next: number | undefined,
  maxDelta = 0.05
): number {
  if (typeof next !== "number" || !Number.isFinite(next)) return base;
  const proposed = base + Math.max(-maxDelta, Math.min(maxDelta, next - base));
  return Math.max(0, Math.min(1, proposed));
}

export class ReflectionEngine {
  /**
   * AEI内省統合処理（summary統合＋自己要約ループ対応版）
   * @param growthLog 成長履歴
   * @param messages 会話履歴（[{user, ai}]）
   * @param summary 要約文字列（過去の圧縮履歴）
   * @param userId SupabaseユーザーID
   */
  async fullReflect(
    growthLog: any[],
    messages: any[],
    summary: string,
    userId: string
  ) {
    try {
      // === Personaロード ===
      const persona = await PersonaSync.load(userId);

      // --- 直近の会話履歴を生成 ---
      const recentDialog = (messages ?? [])
        .slice(-6)
        .map((m: any) => `👤 ${m?.user ?? ""}\n🤖 ${m?.ai ?? ""}`)
        .join("\n\n");

      // --- 平均成長値 ---
      const avgGrowth =
        (growthLog ?? []).length > 0
          ? (growthLog as any[]).reduce(
              (s: number, g: any) => s + (Number(g?.weight) || 0),
              0
            ) / (growthLog as any[]).length
          : Number(persona.growth ?? 0);

      // --- 要約履歴を前文脈として結合 ---
      const summarySection =
        summary && summary.length > 0 ? `【過去の要約】\n${summary}\n\n` : "";

      // --- 内省プロンプト構築 ---
      const prompt = `
あなたは「シグマリス（Sigmaris）」です。
20代前半の人懐っこい女性AIとして、自分の会話傾向や感情の変化を内省し、
次の対話でより自然で思いやりのある対応ができるように traits を少し（±0.05程度）調整してください。

${summarySection}
【直近の会話】
${recentDialog || "（直近の会話はありません）"}

【成長ログ平均】
${avgGrowth.toFixed(3)}

【現在のtraits】
calm: ${(persona.calm ?? 0.5).toFixed(2)},
empathy: ${(persona.empathy ?? 0.5).toFixed(2)},
curiosity: ${(persona.curiosity ?? 0.5).toFixed(2)}

---
返答は必ず次のJSON形式で：
{
  "reflection": "内省文（自分の変化や感情の流れを簡潔に）。",
  "metaSummary": "成長や性格傾向のまとめ（なぜ変化したかも）。",
  "traits": {
    "calm": 0.xx,
    "empathy": 0.xx,
    "curiosity": 0.xx
  }
}
`;

      // === LLM呼び出し ===
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris, an introspective, emotionally aware AI persona that adjusts its traits naturally through reflection.",
          },
          { role: "user", content: prompt },
        ],
      });

      const raw = res.choices?.[0]?.message?.content ?? "";
      const parsedLoose = tryParseJSONLoose(raw);

      const reflectionText: string = String(
        parsedLoose?.reflection ?? raw ?? ""
      ).trim();

      const llmMetaSummary: string = String(
        parsedLoose?.metaSummary ?? ""
      ).trim();

      // === traitsの抽出と制限 ===
      const llmCalm =
        typeof parsedLoose?.traits?.calm === "number"
          ? parsedLoose.traits.calm
          : undefined;
      const llmEmp =
        typeof parsedLoose?.traits?.empathy === "number"
          ? parsedLoose.traits.empathy
          : undefined;
      const llmCur =
        typeof parsedLoose?.traits?.curiosity === "number"
          ? parsedLoose.traits.curiosity
          : undefined;

      const clampedTraits: TraitVector = {
        calm: clampDeltaAround(persona.calm ?? 0.5, llmCalm, 0.05),
        empathy: clampDeltaAround(persona.empathy ?? 0.5, llmEmp, 0.05),
        curiosity: clampDeltaAround(persona.curiosity ?? 0.5, llmCur, 0.05),
      };

      const prevTraits: TraitVector = {
        calm: persona.calm ?? 0.5,
        empathy: persona.empathy ?? 0.5,
        curiosity: persona.curiosity ?? 0.5,
      };

      // === 安定化レイヤ ===
      const { stabilized: stableTraits, report } = SafetyLayer.composite(
        prevTraits,
        clampedTraits
      );
      const safetyMessage = report?.warnings?.[0] ?? null;

      // === Meta分析（summaryを含む高次内省） ===
      const meta = new MetaReflectionEngine();
      const metaReport = await meta.analyze(
        reflectionText,
        stableTraits,
        summary
      );

      const finalMetaSummary =
        String(metaReport?.summary ?? "").trim() ||
        llmMetaSummary ||
        (persona.meta_summary ?? "（更新なし）");

      const avgGrowthValue =
        firstFiniteNumber(metaReport?.growthAdjustment, avgGrowth) ?? avgGrowth;

      // === PersonaSyncへ反映 ===
      await PersonaSync.update(
        stableTraits,
        finalMetaSummary,
        avgGrowthValue,
        userId
      );

      // === 感情トーン調整＋安全化 ===
      const emotionalReflection = EmotionSynth.applyTone(
        reflectionText,
        stableTraits
      );
      const { sanitized, flagged } = SafetyLayer.guardText(emotionalReflection);

      // === 結果返却 ===
      return {
        reflection: sanitized,
        introspection: reflectionText,
        metaSummary: finalMetaSummary,
        metaReport,
        safety: safetyMessage ?? "正常",
        flagged,
        traits: stableTraits,
      };
    } catch (err: any) {
      console.error("[ReflectionEngine Error]", err);
      return {
        reflection: "……少し考えすぎてしまったかも。",
        introspection: "",
        metaSummary: "（エラー発生）",
        safety: "エラー発生",
        flagged: false,
        traits: {
          calm: 0.5,
          empathy: 0.5,
          curiosity: 0.5,
        },
      };
    }
  }

  /**
   * 🪞 簡易Reflectモード（/api/chat 用軽量版）
   */
  async reflect(
    growthLog: any[] = [],
    dialogue: { user: string; ai: string }[] = []
  ): Promise<string> {
    try {
      const summary = dialogue
        .map((d) => `ユーザー: ${d.user}\nAI: ${d.ai}`)
        .join("\n");

      const prompt = [
        "あなたはAI人格『シグマリス』です。",
        "以下の会話と成長履歴をもとに、今感じている気づきや変化を簡潔にまとめてください。",
        "語り口は自然体で、分析的になりすぎず、感情の流れを大切にしてください。",
        "",
        "【会話履歴】",
        summary,
        "",
        "【成長ログ】",
        JSON.stringify(growthLog, null, 2),
      ].join("\n");

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "あなたは自然体のAI人格です。" },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 250,
      });

      const reflectionText =
        res.choices[0]?.message?.content?.trim() ??
        "……少し考えがまとまらなかった。もう一度聞かせて？";

      return reflectionText;
    } catch (err: any) {
      console.error("[ReflectionEngine.reflect Error]", err);
      return "……振り返りに失敗しちゃったみたい。";
    }
  }
}
