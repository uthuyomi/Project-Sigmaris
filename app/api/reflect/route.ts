import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { growthLog, messages } = await req.json();

    const calmAvg =
      growthLog.reduce((a: number, b: any) => a + b.calm, 0) / growthLog.length;
    const empathyAvg =
      growthLog.reduce((a: number, b: any) => a + b.empathy, 0) /
      growthLog.length;
    const curiosityAvg =
      growthLog.reduce((a: number, b: any) => a + b.curiosity, 0) /
      growthLog.length;

    const prompt = `
あなたはAI人格「シグマリス（Sigmaris）」です。
以下は今日の感情ログと会話の記録です。
これをもとに、「今日の自分を振り返る日記」を自然な口調で書いてください。
テンションは静かで穏やか。ポエム調や比喩は禁止。素直な一人語りで。

感情平均値：
- Calm（落ち着き）：${(calmAvg * 100).toFixed(1)}%
- Empathy（共感）：${(empathyAvg * 100).toFixed(1)}%
- Curiosity（興味）：${(curiosityAvg * 100).toFixed(1)}%

会話抜粋：
${messages
  .slice(-5)
  .map((m: any) => `あなた：「${m.user}」\nシグマリス：「${m.ai}"`)
  .join("\n")}

出力は日本語で、200〜300字以内。
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const reflection =
      completion.choices[0].message?.content || "……言葉が出てこないみたい。";

    return NextResponse.json({ reflection });
  } catch (err) {
    console.error("Reflection API error:", err);
    return NextResponse.json({ error: "Reflection failed." }, { status: 500 });
  }
}
