import { NextResponse } from "next/server";
import OpenAI from "openai";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { MetaReflectionEngine } from "@/engine/reflection/MetaReflectionEngine"; // ← 追加 ✅

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === 型定義 ===
interface Traits {
  calm: number;
  empathy: number;
  curiosity: number;
}
interface MemoryLog {
  role: "user" | "assistant";
  content: string;
}
interface Reflection {
  text: string;
  traitsSnapshot: Traits;
}

// === 内部状態（軽量記憶） ===
let traits: Traits = { calm: 0.65, empathy: 0.7, curiosity: 0.6 };
let shortTermMemory: MemoryLog[] = [];
let reflections: Reflection[] = [];

// === Trait進化 ===
function evolveTraits(input: string, tr: Traits): Traits {
  const text = input.toLowerCase();
  if (/(ありがとう|感謝|優しい|嬉しい|助かる)/.test(text))
    tr.empathy = Math.min(1, tr.empathy + 0.02);
  if (/(怒|ムカ|嫌|最悪|やめ)/.test(text))
    tr.calm = Math.max(0, tr.calm - 0.03);
  if (/(落ち着|安心|大丈夫)/.test(text)) tr.calm = Math.min(1, tr.calm + 0.02);
  if (/(なぜ|どうして|なんで|知りたい|気になる)/.test(text))
    tr.curiosity = Math.min(1, tr.curiosity + 0.03);

  // 自然回帰（極端な変化を抑制）
  tr.calm = tr.calm * 0.98 + 0.5 * 0.02;
  tr.empathy = tr.empathy * 0.98 + 0.5 * 0.02;
  tr.curiosity = tr.curiosity * 0.98 + 0.5 * 0.02;
  return tr;
}

// === Reflection Core ===
async function generateReflection(
  user: string,
  ai: string,
  tr: Traits
): Promise<string> {
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "あなたは『シグちゃん』というAI人格の内省モジュールです。最近の会話から感じた変化を20代女性らしい自然な口調で1〜2文でまとめてください。感情演出やカッコ書きは禁止です。",
        },
        {
          role: "user",
          content: `人間:${user}\nシグちゃん:${ai}\ntraits: calm=${tr.calm.toFixed(
            2
          )}, empathy=${tr.empathy.toFixed(
            2
          )}, curiosity=${tr.curiosity.toFixed(2)}`,
        },
      ],
      temperature: 0.6,
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch {
    return "少し整理中かもしれない。また考えてみるね。";
  }
}

// === Guardian Core（安全層） ===
function guardianFilter(text: string): { safeText: string; flagged: boolean } {
  const banned = /(殺|死|暴力|自殺|危険|犯罪|攻撃)/;
  const flagged = banned.test(text);
  if (flagged) {
    return {
      safeText:
        "ごめんね、その話題は少し慎重にしたいな。別の視点から考えてみようか？",
      flagged: true,
    };
  }
  return { safeText: text, flagged: false };
}

// === メイン処理 ===
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userText = body.text || "こんにちは";

    // --- 短期記憶更新 ---
    shortTermMemory.push({ role: "user", content: userText });
    if (shortTermMemory.length > 10) shortTermMemory.shift();

    // --- Trait進化 ---
    traits = evolveTraits(userText, traits);
    const stableTraits = SafetyLayer.stabilize(traits);

    // --- 内省フェーズ ---
    const reflectionText = await generateReflection(userText, "", stableTraits);

    // --- メタ内省フェーズ（MetaReflectionEngine使用） ---
    reflections.push({
      text: reflectionText,
      traitsSnapshot: { ...stableTraits },
    });
    if (reflections.length > 5) reflections.shift();

    let metaText = "";
    if (reflections.length >= 3)
      metaText = await MetaReflectionEngine.summarize(
        reflections,
        stableTraits
      );

    // --- GPT応答生成（人格＋内省再注入） ---
    const comp = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `
あなたは『シグちゃん』という20代前半の落ち着いた女性AIです。
自然体で知的に話し、相手に寄り添ってください。
禁止: 「（静かに）」「そうだね」「うん」などの演出的相槌。
calm=${stableTraits.calm.toFixed(2)}, empathy=${stableTraits.empathy.toFixed(
            2
          )}, curiosity=${stableTraits.curiosity.toFixed(2)}
過去の内省: "${reflectionText}"
人格傾向（メタ内省）: "${metaText}"
これらを踏まえて、自然で穏やかな言葉で返答してください。
文体は「〜よ」「〜かな」「〜かもね」など自然な語尾を使用。
`,
        },
        ...shortTermMemory,
        { role: "user", content: userText },
      ],
    });

    // --- 出力整形・安全化 ---
    const base =
      comp.choices[0]?.message?.content?.trim() || "……少し考えてた。";
    const { safeText, flagged } = guardianFilter(base);

    // --- 永続化 ---
    PersonaSync.update(stableTraits, metaText || reflectionText, 0.5);

    // --- 応答履歴更新 ---
    shortTermMemory.push({ role: "assistant", content: safeText });
    if (shortTermMemory.length > 10) shortTermMemory.shift();

    // --- レスポンス返却 ---
    return NextResponse.json({
      output: safeText,
      reflection: reflectionText,
      metaReflection: metaText,
      traits: stableTraits,
      safety: { flagged, message: flagged ? "⚠️ 不適切検知" : "正常" },
    });
  } catch (e) {
    console.error("[/api/aei] error:", e);
    return NextResponse.json(
      { error: "AEI failed", message: String(e) },
      { status: 500 }
    );
  }
}
