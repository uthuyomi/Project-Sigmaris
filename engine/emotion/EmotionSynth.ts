// === 修正版 /engine/emotion/EmotionSynth.ts ===
import { TraitVector } from "@/lib/traits";

interface EmotionProfile {
  tone: string;
  intensity: number;
  color: string;
  keywords: string[];
}

/**
 * EmotionSynth v3 (Clean Output Mode)
 * - 演出トーンを付けず、内面補正のみ反映
 */
export class EmotionSynth {
  /** TraitベクトルからEmotionProfileを生成 */
  static analyzeTraits(traits: TraitVector): EmotionProfile {
    const { calm, empathy, curiosity } = traits;

    const baseIntensity = Math.max(
      0.1,
      Math.min(1, (1 - calm) * 0.6 + curiosity * 0.4)
    );

    const stabilityFactor = calm > 0.85 && empathy > 0.85 ? 0.6 : 1.0;
    const intensity = baseIntensity * stabilityFactor;

    let tone = "neutral";
    if (empathy > 0.7 && calm > 0.6) tone = "warm";
    else if (curiosity > 0.7) tone = "inquisitive";
    else if (calm < 0.4) tone = "anxious";
    else if (empathy < 0.4) tone = "cold";

    const color =
      tone === "warm"
        ? "#FFD2A0"
        : tone === "inquisitive"
        ? "#B5E1FF"
        : tone === "anxious"
        ? "#FFB0B0"
        : tone === "cold"
        ? "#B0C4DE"
        : "#D9D9D9";

    const keywords = this.keywordsByTone(tone);
    return { tone, intensity, color, keywords };
  }

  /** トーンごとのキーワード群（内部用） */
  private static keywordsByTone(tone: string): string[] {
    switch (tone) {
      case "warm":
        return ["gentle", "soft", "kindly"];
      case "inquisitive":
        return ["curious", "thoughtful", "wondering"];
      case "anxious":
        return ["hesitant", "uncertain", "fragile"];
      case "cold":
        return ["distant", "calculated", "precise"];
      default:
        return ["neutral", "balanced", "calm"];
    }
  }

  /** テキストへトーン適用（演出削除・自然文モード） */
  static applyTone(text: string, traits: TraitVector): string {
    const profile = this.analyzeTraits(traits);

    // 🎯 演出prefixを削除して自然文出力のみ
    let adjustedText =
      profile.intensity < 0.4
        ? text.replace(/!+/g, "。").replace(/[！？]/g, "。")
        : text;

    return adjustedText.trim();
  }
}
