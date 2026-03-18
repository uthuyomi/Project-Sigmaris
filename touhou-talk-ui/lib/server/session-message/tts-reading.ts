import OpenAI from "openai";

let readingClient: OpenAI | null | undefined;

function getReadingClient(): OpenAI | null {
  if (readingClient !== undefined) return readingClient;
  const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    readingClient = null;
    return readingClient;
  }
  readingClient = new OpenAI({ apiKey });
  return readingClient;
}

export async function generateTtsReadingText(params: {
  characterId: string;
  replyText: string;
}): Promise<{ readingText: string | null; model: string | null }> {
  const replyText = String(params.replyText ?? "").trim();
  if (!replyText) return { readingText: null, model: null };

  const client = getReadingClient();
  const model = String(process.env.SIGMARIS_PERSONA_MODEL ?? "gpt-5.2").trim() || "gpt-5.2";
  if (!client) return { readingText: null, model };

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.1,
        max_completion_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "あなたは日本語TTS向けの読み変換器です。自然な表示文は変更せず、発音用の読みだけを生成します。",
          },
          {
            role: "developer",
            content: [
              "出力は読みテキスト1本のみ。JSON・説明・注釈は禁止。",
              "AquesTalk1で読みやすい、ひらがな中心の日本語発音へ変換する。",
              "句読点や感嘆符、疑問符、三点リーダなどの間はできるだけ維持する。",
              "東方Project固有名詞や地名は一般的な読みへ寄せる。",
              "英字・略語・記号は、意味を壊さない範囲で発音しやすいカタカナ/ひらがなへ変換してよい。",
              "元文の意味を変えない。台詞の口調も極力保つ。",
              `character_id=${params.characterId}`,
            ].join("\n"),
          },
          {
            role: "user",
            content: replyText,
          },
        ],
      },
      {
        signal: AbortSignal.timeout(8000),
      }
    );

    const readingText = String(completion.choices[0]?.message?.content ?? "").trim();
    if (!readingText) return { readingText: null, model };
    return { readingText, model };
  } catch (error) {
    console.warn("[touhou] tts reading generation failed:", error);
    return { readingText: null, model };
  }
}
