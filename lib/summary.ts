// ===== /lib/summary.ts =====
"use server";

/**
 * summarize()
 * ─────────────────────────────────────────────
 * 長文の履歴を圧縮し、過去の流れを維持した「文脈サマリー」を生成する。
 *
 * 呼び出し例：
 * const summary = await summarize(messages.slice(0, -10));
 *
 * 目的：
 * ・大量の履歴を毎回送らずに済む（応答速度向上）
 * ・成長構造（PersonaDBなど）には影響を与えない
 * ・人格的文脈を短い形で保持する
 */

export async function summarize(messages: any[]): Promise<string> {
  if (!messages || messages.length === 0) return "";

  // ユーザーとAIのやり取りを連結
  const joined = messages
    .map((m) => `User: ${m.user}\nAI: ${m.ai}`)
    .join("\n\n");

  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: joined,
      }),
    });

    const data = await res.json();
    return data.summary || "";
  } catch (err) {
    console.error("Summarization failed:", err);
    return "";
  }
}
