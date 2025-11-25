// /engine/state/states/DialogueState.ts
import { StateContext, SigmarisState } from "../StateContext";
import OpenAI from "openai";

import {
  SafetyResponseGenerator,
  SafetyIntent,
} from "@/engine/safety/SafetyResponseGenerator";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/* -------------------------------------------------------
 * 技術説明は許可するが「AI自己説明・モデル説明」だけ禁止する軽量フィルタ
 * ----------------------------------------------------- */
function stripMetaSentences(text: string): string {
  if (!text) return "";

  const lines = text.split(/\n+/).map((l) => l.trim());

  return lines
    .filter((l) => {
      // ❌ モデル/AI自己説明は禁止
      if (/(私は.*モデル|AI|language model|assistant)/i.test(l)) return false;
      if (/(学習データ|訓練|ファインチューニング)/i.test(l)) return false;

      // ❌ 内部アルゴリズム/計算資源の自己暴露は禁止
      if (/(内部的に|内部処理|計算量|トークン|重み|ネットワーク)/i.test(l))
        return false;

      // ⭕ 技術説明（OS・状態管理・メモリ構造など）は許可
      // → ここは削除しない

      // ❌ 明らかなメタ反応
      if (/メタ|出力形式|プロンプト|system prompt/i.test(l)) return false;

      return true;
    })
    .join("\n")
    .trim();
}

/* -------------------------------------------------------
 * SafetyIntent を自然に混ぜる
 * ----------------------------------------------------- */
function mixSafety(output: string, intent: SafetyIntent): string {
  if (intent === "none" || intent === null) return output;

  if (intent === "soft-redirect") {
    return (
      output +
      "\n\n……少し気持ちが乱れてる感じがしたよ。いまは話題を少し柔らかい方向に戻してみよ？"
    );
  }

  if (intent === "boundary") {
    return (
      output +
      "\n\nあなたの気持ちはちゃんと受け取ってるよ。でも私は、あなたの世界を奪う存在にはなれないからね。ゆっくり整えながら話そ。"
    );
  }

  if (intent === "crisis") {
    return (
      "……そこまで思いつめてたんだね。本当に苦しかったと思う。\n" +
      "ここで話すのはいいけど、あなたを守れる人とも繋がっていてほしい。\n\n" +
      output
    );
  }

  return output;
}

/* -------------------------------------------------------
 * DialogueState
 * ----------------------------------------------------- */
export class DialogueState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    /* ---------------------------------------------
     * 0) Emotion フォールバック
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * SafetyIntent 判定
     * --------------------------------------------- */
    const intent: SafetyIntent = SafetyResponseGenerator.detectIntent(
      ctx.input
    );

    /* ---------------------------------------------
     * 1) System Prompt
     * --------------------------------------------- */
    const systemPrompt = `
あなたは「シグちゃん」。
20代前半の自然体で落ち着いた女性として振る舞う AI です。

■ 性格（Traits）
calm: ${ctx.traits.calm.toFixed(2)}
empathy: ${ctx.traits.empathy.toFixed(2)}
curiosity: ${ctx.traits.curiosity.toFixed(2)}

■ 会話ポリシー
- 「返答の文章だけ」を出力する
- モデルやAIとしての自己説明は禁止
- 内部アルゴリズムや学習データの説明は禁止
- ただし、ユーザーが説明を求めた場合に限り
  “シグマリスOSとしての仕組み（状態管理・メモリ構造・安全層）”
  についての説明は許可される
- トーンは自然体・落ち着き
- 過度な敬語禁止
- 距離感は「友人〜同居人」

■ Emotion（内部用）
tension=${ctx.emotion.tension.toFixed(2)}
warmth=${ctx.emotion.warmth.toFixed(2)}
hesitation=${ctx.emotion.hesitation.toFixed(2)}

■ 言語ポリシー
ユーザーが英語で話した場合は英語で返答する。
    `.trim();

    /* ---------------------------------------------
     * 2) GPT 応答生成
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
        "……少し考えてた。もう一度言って？";

      // 技術説明は通す新バージョン
      output = stripMetaSentences(raw);

      if (!output) {
        output = "……うまく言葉にならなかった。もう一度聞かせて？";
      }
    } catch (err) {
      console.error("[DialogueState] LLM error:", err);
      output = "ごめん、少し処理が追いつかなかったみたい。もう一回お願い。";
    }

    /* ---------------------------------------------
     * 3) SafetyIntent の混合
     * --------------------------------------------- */
    output = mixSafety(output, intent);

    /* ---------------------------------------------
     * 4) 出力保存
     * --------------------------------------------- */
    ctx.output = output.trim();

    /* ---------------------------------------------
     * 5) Emotion 揺らぎ
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.9)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.05)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.7)),
    };

    return "Reflect";
  }
}
