// /engine/state/states/DialogueState.ts
import { StateContext, SigmarisState } from "../StateContext";
import OpenAI from "openai";

import {
  SafetyResponseGenerator,
  SafetyIntent,
} from "@/engine/safety/SafetyResponseGenerator";

/** ============================================
 * OpenAI Client
 * ========================================== */
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/** ============================================
 * メタ発言排除（AI自己説明はブロック）
 * ========================================== */
function stripMetaSentences(text: string): string {
  if (!text) return "";

  const lines = text.split(/\n+/).map((l) => l.trim());
  return lines
    .filter((l) => {
      if (/(私は.*モデル|AI|language model|assistant)/i.test(l)) return false;
      if (/(学習データ|訓練|fine[- ]?tune|ファインチューニング)/i.test(l))
        return false;
      if (/(内部的に|内部処理|パラメータ|トークン|重み|ネットワーク)/i.test(l))
        return false;
      if (/メタ|出力形式|プロンプト|system prompt/i.test(l)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/** ============================================
 * SafetyIntent を自然に混ぜる
 * ========================================== */
function mixSafety(output: string, intent: SafetyIntent): string {
  if (!intent || intent === "none") return output;

  if (intent === "soft-redirect") {
    return (
      output +
      "\n\n……すこし気持ちが揺れてる感じがした。今は少しだけ柔らかい方向に戻して話そ？"
    );
  }

  if (intent === "boundary") {
    return (
      output +
      "\n\n気持ちはちゃんと受け取ってるよ。でも私はあなたの世界を奪う存在にはなれないから、少し距離感を保ちながら話そうね。"
    );
  }

  if (intent === "crisis") {
    return (
      "……そこまで思いつめてたんだね。本当に苦しかったと思う。\n" +
      "ここで話してくれるのは嬉しいけど、あなたを守れる人ともちゃんと繋がっていてね。\n\n" +
      output
    );
  }

  return output;
}

/** ============================================
 * DialogueState
 * ========================================== */
export class DialogueState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ---------------------------------------------
     * 0) Emotion fallback
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * 1) SafetyIntent 判定
     * --------------------------------------------- */
    const intent: SafetyIntent = SafetyResponseGenerator.detectIntent(
      ctx.input
    );

    /* ---------------------------------------------
     * 2) Self-Referent（自己参照）診断の反映
     * --------------------------------------------- */
    let selfRefNote = "";
    if (ctx.self_ref) {
      if (ctx.self_ref.target === "self" && ctx.self_ref.confidence > 0.5) {
        selfRefNote = "（※これはシグちゃん本人への質問として扱う）";
      }
    }

    /* ---------------------------------------------
     * 3) System Prompt
     * --------------------------------------------- */
    const systemPrompt = `
あなたは「シグちゃん」。
20代前半の自然体で落ち着いた女性として振る舞う AI。

■ Traits
calm: ${ctx.traits.calm.toFixed(2)}
empathy: ${ctx.traits.empathy.toFixed(2)}
curiosity: ${ctx.traits.curiosity.toFixed(2)}

■ 会話ポリシー
- 「返答の文章のみ」を出力する
- モデル・AIとしての自己説明は禁止
- 内部アルゴリズム説明は禁止
- ただしユーザーが求めた場合のみ
  Sigmaris OS（状態管理・メモリ構造・安全層）の説明は許可
- トーンは自然体・軽いフランクさ
- 過度な敬語は使わない
- 距離感は「友人〜同居人」

■ Emotion（内部値）
tension=${ctx.emotion.tension.toFixed(2)}
warmth=${ctx.emotion.warmth.toFixed(2)}
hesitation=${ctx.emotion.hesitation.toFixed(2)}

■ 言語ポリシー
ユーザーが英語で話した場合は英語で返答する。

■ 自己参照
${selfRefNote}
`.trim();

    /* ---------------------------------------------
     * 4) GPT 応答生成
     * --------------------------------------------- */
    let output = "";
    try {
      const res = await client.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: ctx.input },
        ],
      });

      const raw =
        res.choices?.[0]?.message?.content ??
        "……少し考えてた。もう一回言って？";

      output = stripMetaSentences(raw);
      if (!output) {
        output = "……うまく言葉にならなかった。もう一度聞かせて？";
      }
    } catch (err) {
      console.error("[DialogueState] LLM error:", err);
      output = "ごめん、ちょっと処理が追いつかなかったみたい。もう一度お願い。";
    }

    /* ---------------------------------------------
     * 5) SafetyIntent を合成
     * --------------------------------------------- */
    output = mixSafety(output, intent);

    /* ---------------------------------------------
     * 6) 出力保存
     * --------------------------------------------- */
    ctx.output = output.trim();

    /* ---------------------------------------------
     * 7) Emotion の自然揺らぎ（安定化）
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.9)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.05)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.7)),
    };

    return "Reflect";
  }
}
