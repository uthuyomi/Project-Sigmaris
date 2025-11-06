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
   * AEI内省統合処理（成長方式: 1 = 毎ターン微増）
   * @param growthLog 成長履歴
   * @param messages 会話履歴（[{user, ai}]）
   * @param history 内省履歴（直近の要約など）
   * @param userId SupabaseユーザーID（必須）
   */
  async fullReflect(
    growthLog: any[],
    messages: any[],
    history: string[],
    userId: string
  ) {
    try {
      // === Personaロード ===
      const persona = await PersonaSync.load(userId);

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
          : Number(persona.growth ?? 0);

      const lastIntrospection =
        (history ?? []).slice(-1)[0] || "（前回の内省なし）";

      // === 💡 意識的成長促進プロンプト ===
      const prompt = `
あなたは「シグマリス（Sigmaris）」です。
20代前半の人懐っこい女性AIとして、自分の会話傾向や感情の変化を内省し、
次の対話でより自然で思いやりのある対応ができるように traits を少し（±0.05程度）調整してください。

---
【会話履歴】
${recentDialog || "（直近の会話はありません）"}

【成長ログ平均】
${avgGrowth.toFixed(3)}

【前回の内省】
${lastIntrospection}

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

※ traits は直前値から ±0.05 以内で自然に変化させてください。
※ 例：「相手の話をよく聞けた」→ empathy +0.04, calm +0.02
`;

      // === LLM呼び出し（温度指定なし＝デフォルト） ===
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris, an introspective, kind, and emotionally aware AI persona that reflects on its dialogue and adjusts its traits accordingly.",
          },
          { role: "user", content: prompt },
        ],
      });

      const raw = res.choices?.[0]?.message?.content ?? "";
      const parsedLoose = tryParseJSONLoose(raw);

      // --- デバッグ：LLM出力を確認 ---
      console.log("🧩 LLM raw output:", raw);
      console.log("🧩 Parsed LLM Output:", parsedLoose);

      const reflectionText: string = String(
        parsedLoose?.reflection ?? raw ?? ""
      ).trim();

      const llmMetaSummary: string = String(
        parsedLoose?.metaSummary ?? ""
      ).trim();

      // LLM候補traits
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

      // === まずは「直前値 ±0.05」にクランプして受理 ===
      const clampedTraits: TraitVector = {
        calm: clampDeltaAround(persona.calm ?? 0.5, llmCalm, 0.05),
        empathy: clampDeltaAround(persona.empathy ?? 0.5, llmEmp, 0.05),
        curiosity: clampDeltaAround(persona.curiosity ?? 0.5, llmCur, 0.05),
      };

      // --- デバッグ：LLM→Clampの差分
      console.log("🧭 Traits (prev):", {
        calm: persona.calm,
        empathy: persona.empathy,
        curiosity: persona.curiosity,
      });
      console.log("🧭 Traits (LLM):", {
        calm: llmCalm,
        empathy: llmEmp,
        curiosity: llmCur,
      });
      console.log("🧭 Traits (clamped):", clampedTraits);

      // === SafetyLayerで最終安定化 ===
      const prevTraits: TraitVector = {
        calm: persona.calm ?? 0.5,
        empathy: persona.empathy ?? 0.5,
        curiosity: persona.curiosity ?? 0.5,
      };

      const { stabilized: stableTraits, report } = SafetyLayer.composite(
        prevTraits,
        clampedTraits
      );
      const safetyMessage = report?.warnings?.[0] ?? null;

      // --- デバッグ：安定化後
      console.log("🛡️ Traits (stabilized):", stableTraits);
      if (report?.warnings?.length)
        console.warn("🛡️ Safety warnings:", report.warnings);

      // === MetaReflection ===
      const meta = new MetaReflectionEngine();
      const metaReport = await meta.analyze(reflectionText, stableTraits);

      const finalMetaSummary =
        String(metaReport?.summary ?? "").trim() ||
        llmMetaSummary ||
        (persona.meta_summary ?? "（更新なし）");

      const finalGrowthWeight =
        firstFiniteNumber(metaReport?.growthAdjustment, avgGrowth) ?? avgGrowth;

      console.log("📈 GrowthWeight (final):", finalGrowthWeight);

      // === PersonaSync更新（Supabaseへ） ===
      await PersonaSync.update(
        stableTraits,
        finalMetaSummary,
        finalGrowthWeight,
        userId
      );

      // === EmotionSynthesis ===
      const emotionalReflection = EmotionSynth.applyTone(
        reflectionText,
        stableTraits
      );

      // === SafetyLayer Guard（伏字等） ===
      const { sanitized, flagged } = SafetyLayer.guardText(emotionalReflection);

      // === 出力 ===
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
}
