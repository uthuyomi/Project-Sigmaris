import { TouhouChatMode } from "@/lib/touhouPersona";

export function isFirstAssistantTurn(
  history: Array<{ role: "user" | "assistant"; content: string }>,
) {
  return !history.some(
    (m) => m.role === "assistant" && String(m.content ?? "").trim(),
  );
}

export function buildRecentUserText(params: {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  currentUserText: string;
}) {
  const parts: string[] = [];
  const recentUsers = params.history
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => String(m.content ?? ""));
  parts.push(...recentUsers);
  parts.push(String(params.currentUserText ?? ""));
  return parts.join("\n").toLowerCase();
}

export function sanitizeReplyByContext(params: {
  characterId: string;
  chatMode: TouhouChatMode;
  reply: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  currentUserText: string;
}) {
  let out = String(params.reply ?? "");
  if (!out.trim()) return out;

  const lowerRecentUser = buildRecentUserText({
    history: params.history,
    currentUserText: params.currentUserText,
  });

  // 1) Generic: avoid “ユーザー発話の分類説明” (AI臭)
  // Example: 「元気？」は、あいさつ。それともちゃんと調子チェック。
  out = out.replace(
    /「[^」]{1,40}」は、?\s*(?:あいさつ|挨拶|調子チェック)[^。\n]*[。\n]?/g,
    "",
  );

  // 2) Koishi: “みつけた / やっほー” are strong openers; don't inject without context
  if (params.chatMode === "roleplay" && params.characterId === "koishi") {
    const allowMitsuketa =
      isFirstAssistantTurn(params.history) ||
      /みつけ|見つけ|探|かくれんぼ|どこ|いる|気づ/i.test(lowerRecentUser);

    if (!allowMitsuketa) {
      // Remove sentence-start “みつけた” (no replacement; avoid extra filler).
      out = out.replace(/(^|\n)\s*みつけた[。！!…]*\s*/g, "$1");
    }

    const allowYahho =
      isFirstAssistantTurn(params.history) ||
      /やっほ|こんにちは|こんちは|はじめまして|雑談|話そ|話す/i.test(
        lowerRecentUser,
      );
    if (!allowYahho) {
      // Remove sentence-start “やっほー” (no replacement; avoid extra filler).
      out = out.replace(/(^|\n)\s*…{2,}やっほー[。！!…]*\s*/g, "$1");
      out = out.replace(/(^|\n)\s*やっほー[。！!…]*\s*/g, "$1");
    }
  }

  // 3) Reimu: keep light jokes, but remove harsh coercion around “賽銭”.
  if (params.chatMode === "roleplay" && params.characterId === "reimu") {
    const saisenWord = "(?:賽銭箱|お賽銭|賽銭|寄付)";
    const userMentionsSaisen = new RegExp(saisenWord).test(lowerRecentUser);
    if (!userMentionsSaisen) {
      const before = out;
      out = out.replace(
        new RegExp(
          `[^。！？\\n]*${saisenWord}[^。！？\\n]*(?:寄越せ|よこせ|払え|出さないと|出さなきゃ|出さなければ|出さないなら|出せ(?!ば)|出しな)[^。！？\\n]*[。！？]?`,
          "g",
        ),
        "",
      );
      out = out.replace(/\n{3,}/g, "\n\n").trim();
      if (!out) out = before;
    }
  }

  // 4) Reimu: avoid “心情の分類（二択）”質問がカウンセラーっぽくなるのを抑える
  if (params.chatMode === "roleplay" && params.characterId === "reimu") {
    // If the exchange is about tiredness/low energy, don't force the user into “A or B”.
    // Replace with a single concrete question.
    const fatigue = /(疲れ|だる|しんど|モヤモヤ|憂鬱|眠|やる気)/i;
    if (fatigue.test(lowerRecentUser)) {
      out = out.replace(
        /(疲れ|だる|しんど|モヤモヤ|憂鬱|眠|やる気)[^。\n]{0,120}(?:どっち寄り|どっちに近い)[？?]/g,
        "で、いま一番面倒なのは何？",
      );
    }
  }

  // Collapse excessive blank lines produced by removals.
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out ? out : String(params.reply ?? "");
}
