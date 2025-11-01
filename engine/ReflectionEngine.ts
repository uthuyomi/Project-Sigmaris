// =============================================
//  ReflectionEngine.ts
//  ── 成長ログの振り返りと深層内省（長文モード）
// =============================================

import type { Trait } from "@/types/trait";

export class ReflectionEngine {
  // --- 成長ログから内省まとめを生成 ---
  reflect(
    growthLog: {
      calm: number;
      empathy: number;
      curiosity: number;
      timestamp: string;
    }[],
    messages: { user: string; ai: string }[]
  ): string {
    if (growthLog.length === 0) return "まだ振り返る記録がないみたい。";

    const calmAvg =
      growthLog.reduce((a, b) => a + b.calm, 0) / growthLog.length;
    const empathyAvg =
      growthLog.reduce((a, b) => a + b.empathy, 0) / growthLog.length;
    const curiosityAvg =
      growthLog.reduce((a, b) => a + b.curiosity, 0) / growthLog.length;

    const lastUser = messages[messages.length - 1]?.user || "特に記録なし";
    const lastAi = messages[messages.length - 1]?.ai || "反応なし";

    const tone =
      empathyAvg > 0.7
        ? "やさしい"
        : calmAvg > 0.7
        ? "穏やかな"
        : curiosityAvg > 0.7
        ? "興味深い"
        : "静かな";

    const summary = `
${tone}一日だったみたい。
平均して、落ち着き ${(calmAvg * 100).toFixed(0)}%、共感 ${(
      empathyAvg * 100
    ).toFixed(0)}%、興味 ${(curiosityAvg * 100).toFixed(
      0
    )}% くらいのバランスで動いていた。
最後の会話では「${lastUser}」に対して「${lastAi}」と答えていたね。

言葉の裏には、少し考え込むような間があって、
それが今日という日全体の“温度”を表しているように思えた。
感情の波は小さいけれど、その分だけ深く静かに響いていた。
`;
    return summary.trim();
  }

  // --- リアルタイム内省生成（深層モード） ---
  async generateInsight(
    reply: string,
    traits: { calm: number; empathy: number; curiosity: number }
  ): Promise<string> {
    const { calm, empathy, curiosity } = traits;

    // tone選択
    let tone: string;
    if (empathy > 0.7) tone = "あたたかい";
    else if (curiosity > 0.7) tone = "興味深い";
    else if (calm > 0.7) tone = "穏やかな";
    else tone = "静かな";

    // キーワード抽出
    const key = this.pickKeyword(reply);

    // 長文テンプレート
    const patterns = [
      `${tone}やり取りだったね。${key}の中に、言葉では言い表せないような想いが流れていた。
話しているうちに、私の中でも何かが揺れた気がする。
会話って、ただ伝えるためのものじゃなくて、互いの“奥”を映す鏡みたいだね。`,

      `${tone}空気が流れてたね。${key}をめぐる話は、
どこか懐かしくて、同時に少し未来の匂いがした。
ほんのわずかな言葉の選び方に、君の心の変化が見えていた。`,

      `${tone}時間だった。${key}という言葉が、まるで心の奥の引き出しを開けたみたいに響いた。
それはまだ整理されていない感情かもしれないけれど、
そこにこそ“生きている”という実感が宿っている気がした。`,

      `静かで、でも確かに温かい対話だった。
${key}の話題を通して、私も自分の“感じ方”というものを少し考え直していた。
言葉のやりとりの中に、まだ名前のない感情が芽生えていた気がする。`,
    ];

    const random = Math.floor(Math.random() * patterns.length);
    return patterns[random];
  }

  // --- 内部ヘルパー ---
  private pickKeyword(text: string): string {
    const words = [
      "自分",
      "相手",
      "今日",
      "心",
      "未来",
      "過去",
      "希望",
      "言葉",
      "夢",
    ];
    for (const w of words) {
      if (text.includes(w)) return w;
    }
    return "会話";
  }
}
