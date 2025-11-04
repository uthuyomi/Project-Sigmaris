// /engine/ReflectionEngine.ts
import OpenAI from "openai";
import { loadPersona, savePersona } from "@/lib/db";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import { EmotionSynth } from "@/engine/EmotionSynth";
import { SafetyLayer } from "@/engine/SafetyLayer"; // ← 安定性制御を追加

// Persona型を定義
interface Persona {
  calm: number;
  empathy: number;
  curiosity: number;
  reflection?: string;
  metaSummary?: string;
  growth?: number;
  timestamp?: string;
}

// savePersona が受け付ける既知プロパティの想定（型エラー回避用）
type PersonaSavePayload = {
  calm: number;
  empathy: number;
  curiosity: number;
  reflectionText: string;
  metaSummary: string;
  growthWeight: number;
};

type TraitVector = Pick<Persona, "calm" | "empathy" | "curiosity">;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** 有効な number を先頭から選ぶ（finite 判定） */
function firstFiniteNumber(
  ...candidates: Array<number | undefined | null>
): number | undefined {
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

/** JSON抽出（```囲みやテキスト混在にも耐える簡易版） */
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

export class ReflectionEngine {
  async fullReflect(growthLog: any[], messages: any[], history: string[]) {
    // === Personaロード（フォールバック付き） ===
    const loaded = (loadPersona() as Persona) ?? {
      calm: 0.5,
      empathy: 0.5,
      curiosity: 0.5,
      metaSummary: "",
      growth: 0,
    };

    const persona: Persona = {
      calm: firstFiniteNumber(loaded.calm) ?? 0.5,
      empathy: firstFiniteNumber(loaded.empathy) ?? 0.5,
      curiosity: firstFiniteNumber(loaded.curiosity) ?? 0.5,
      metaSummary: loaded.metaSummary ?? "",
      growth: firstFiniteNumber(loaded.growth ?? undefined) ?? 0,
      timestamp: loaded.timestamp,
    };

    const recentDialog = (messages ?? [])
      .slice(-6)
      .map((m: any) => `👤 ${m?.user ?? ""}\n🤖 ${m?.ai ?? ""}`)
      .join("\n\n");

    const avgGrowth =
      (growthLog ?? []).length > 0
        ? (growthLog as any[]).reduce(
            (s: number, g: any) => s + (Number(g?.weight) || 0),
            0
          ) / (growthLog as any[]).length
        : persona.growth ?? 0;

    const lastIntrospection =
      (history ?? []).slice(-1)[0] || "（前回の内省なし）";

    const prompt = `
あなたは「シグマリス（Sigmaris）」です。
以下の会話履歴・成長情報・内省履歴をもとに、自分の状態を振り返ってください。

---
【会話履歴】
${recentDialog || "（直近の会話はありません）"}

【成長ログ平均】
${avgGrowth.toFixed(3)}

【前回の内省】
${lastIntrospection}

【現在traits】
calm: ${persona.calm.toFixed(2)}, empathy: ${persona.empathy.toFixed(
      2
    )}, curiosity: ${persona.curiosity.toFixed(2)}
---

以下の形式で返答してください：
{
  "reflection": "自分の状態を内省した文",
  "metaSummary": "自分の成長や感情傾向のまとめ",
  "traits": { "calm": 0.xx, "empathy": 0.xx, "curiosity": 0.xx }
}
`;

    try {
      // === Reflection ===
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris, an introspective AI persona that reflects on its dialogue and updates its personality traits.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const raw = res.choices?.[0]?.message?.content ?? "";
      const parsedLoose = tryParseJSONLoose(raw);

      // フォールバック安全化
      const reflectionText: string = String(
        parsedLoose?.reflection ?? raw ?? ""
      ).trim();
      const llmMetaSummary: string = String(
        parsedLoose?.metaSummary ?? ""
      ).trim();

      const nextTraits: TraitVector = {
        calm: firstFiniteNumber(parsedLoose?.traits?.calm, persona.calm) ?? 0.5,
        empathy:
          firstFiniteNumber(parsedLoose?.traits?.empathy, persona.empathy) ??
          0.5,
        curiosity:
          firstFiniteNumber(
            parsedLoose?.traits?.curiosity,
            persona.curiosity
          ) ?? 0.5,
      };

      // === Safety Layer: Trait安定化・過熱検知 ===
      const normalizedTraits = SafetyLayer.normalize(nextTraits);
      const safetyMessage = SafetyLayer.checkOverload(normalizedTraits);
      const stableTraits = SafetyLayer.stabilize(normalizedTraits);

      // === MetaReflection ===
      const meta = new MetaReflectionEngine();
      const metaReport = await meta.analyze(reflectionText, stableTraits);

      const finalMetaSummary =
        String(metaReport?.summary ?? "").trim() ||
        llmMetaSummary ||
        (persona.metaSummary ?? "（更新なし）");

      const finalGrowthWeight =
        firstFiniteNumber(metaReport?.growthAdjustment, avgGrowth) ?? avgGrowth;

      // === savePersona（最新＋履歴） ===
      const payload: PersonaSavePayload = {
        calm: stableTraits.calm,
        empathy: stableTraits.empathy,
        curiosity: stableTraits.curiosity,
        reflectionText,
        metaSummary: finalMetaSummary,
        growthWeight: finalGrowthWeight,
      };
      savePersona(payload);

      // === Emotion Synthesis でトーン付与 ===
      const emotionalReflection = EmotionSynth.applyTone(
        reflectionText,
        stableTraits
      );

      // === 出力 ===
      return {
        reflection: emotionalReflection,
        introspection: reflectionText,
        metaSummary: finalMetaSummary,
        metaReport,
        safety: safetyMessage ?? "正常",
      };
    } catch (err: any) {
      console.error("[ReflectionEngine Error]", err);
      return {
        reflection: "……少し考えすぎてしまったかも。",
        introspection: "",
        metaSummary: "（エラー発生）",
        safety: "エラー発生",
      };
    }
  }
}
