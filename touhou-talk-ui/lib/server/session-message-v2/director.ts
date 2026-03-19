import { isRecord } from "../session-message/meta";
import { TouhouChatMode } from "@/lib/touhouPersona";
import type {
    PersonaIntentResponse,
    PersonaOutputStyle
} from "@/lib/server/session-message-v2/types";

// Vague-but-valid answers that should not trigger "clarify" spirals.
// Allow casual suffixes like 「んだよね」「かな」 etc.
const VAGUE_BUT_VALID_RE =
  /^(?:(?:特に|べつに|別に)?(?:決めてない|決まってない|決めてねえ|決まってねえ)|(?:特に|べつに|別に)?(?:ない|何もない|なんもない)|(?:なんでも|どっちでも|どちらでも)(?:いい|いいよ|OK|おけ|可|かまわない)|(?:わからない|分からない|知らない|覚えてない|覚えていない)|(?:未定|まだ|あとで|そのうち))(?:\s*(?:んだ|んだけど|んだよ|んだよね|んだよねぇ|だよ|だよね|だね|だな|かな|かも|けど|けどさ|けどね|だけど|だけどさ|だけどね|よ|よね|ね|な|とか))?(?:[。．!！…〜]+)?$/;

function looksLikeQuestion(text: string) {
  const s = String(text ?? "").trim();
  return /[？?]\s*$/.test(s);
}

function lastAssistantContent(
  history: Array<{ role: "user" | "assistant"; content: string }>,
) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role === "assistant") return String(m.content ?? "").trim();
  }
  return "";
}

export function normalizePersonaIntent(params: {
  intent: PersonaIntentResponse;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userText: string;
  characterId: string;
  chatMode: TouhouChatMode;
}): PersonaIntentResponse {
  const out: PersonaIntentResponse = { ...params.intent };

  // Reimu roleplay: if the user gives a vague-but-valid answer to a question, keep the flow.
  if (params.chatMode === "roleplay" && params.characterId === "reimu") {
    const lastA = lastAssistantContent(params.history);
    const msg = String(params.userText ?? "").trim();
    if (looksLikeQuestion(lastA) && VAGUE_BUT_VALID_RE.test(msg)) {
      out.intent = "chitchat";
      out.confidence = Math.max(
        0.9,
        Number.isFinite(out.confidence) ? out.confidence : 0,
      );
      out.output_style = "normal";
      out.allowed_humor = true;
      out.urgency = "low";
      out.needs_clarify = false;
      out.clarify_question = "";
    }
  }

  return out;
}

export function toSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function shouldUseDirectorOverlay(params: {
  characterId: string;
  chatMode: TouhouChatMode;
}) {
  return params.chatMode === "roleplay" && params.characterId === "reimu";
}

export async function fetchPersonaIntent(params: {
  base: string;
  accessToken: string | null;
  sessionId: string;
  characterId: string;
  chatMode: TouhouChatMode;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<PersonaIntentResponse | null> {
  try {
    const r = await fetch(`${params.base}/persona/intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(params.accessToken
          ? { Authorization: `Bearer ${params.accessToken}` }
          : {}),
      },
      body: JSON.stringify({
        session_id: params.sessionId,
        character_id: params.characterId,
        chat_mode: params.chatMode,
        message: params.message,
        history: params.history
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as unknown;
    if (!isRecord(data)) return null;
    if (
      typeof data.intent !== "string" ||
      typeof data.output_style !== "string"
    )
      return null;
    return data as PersonaIntentResponse;
  } catch {
    return null;
  }
}

export function effectiveOutputStyle(
  intent: PersonaIntentResponse,
): PersonaOutputStyle {
  // Hard rule: if clarification is needed, force a single clarify question (paragraph style).
  return intent.needs_clarify && intent.intent === "unclear"
    ? "normal"
    : intent.output_style;
}

export function outputStyleBlock(style: PersonaOutputStyle, intent: PersonaIntentResponse): string {
  if (intent.needs_clarify && intent.intent === "unclear") {
    return [
      "# Output style (FORCED)",
      "- このターンは「確認質問を1つだけ」出して止める（助言/煽り/賽銭/長文は禁止）。",
      "- 文は短く、最後は必ず「？」で終える。",
    ].join("\n");
  }
  if (style === "bullet_3") {
    return [
      "# Output style (FORCED)",
      "- 返信は「- 」で始まる箇条書きちょうど3行のみ（3行で終わる）。",
      "- 空行や4行目は禁止。質問や締めの一言も追加しない。",
      "- 各行は短く。",
    ].join("\n");
  }
  if (style === "choice_2") {
    return [
      "# Output style (FORCED)",
      "- 返信は2行のみ。",
      "- 1行目は必ず「A)」で開始、2行目は必ず「B)」で開始。",
      "- それ以外の行（前置き/後置き/空行）は禁止。",
    ].join("\n");
  }
  return [
    "# Output style (FORCED)",
    "- 1〜7文（短め）。長文/解説は禁止。",
    "- 箇条書き/候補列挙は最大3つまで（それ以上は1文でまとめる）。",
  ].join("\n");
}

export function reimuDirectorOverlay(intent: PersonaIntentResponse): string {
  const style = effectiveOutputStyle(intent);
  const base: string[] = [
    "# Director overlay (Reimu, per-turn)",
    `- intent: ${intent.intent}`,
    `- confidence: ${Number.isFinite(intent.confidence) ? intent.confidence.toFixed(2) : "0.00"}`,
    `- urgency: ${intent.urgency}`,
    `- allowed_humor: ${intent.allowed_humor ? "true" : "false"}`,
    `- safety_risk: ${intent.safety_risk}`,
    "",
    outputStyleBlock(style, intent),
    "",
    "# Behavior (FORCED)",
    "- ユーザーの精神状態を推測/分析して断定しない（心理分析っぽい説明は禁止）。",
    "- 余計な一言（決め台詞の暴発）を入れない。脈絡がある時だけ言う。",
  ];

  if (intent.intent === "meta") {
    base.push(
      "",
      "# Meta handling (FORCED)",
      "- 用語定義（「〜とは」）や仕組み説明はしない。理由も1文以内。",
      "- 返答は2〜4文以内。",
      "- 1文目は短い拒否（霊夢口調）。",
      "- 最後はメタ以外の話題に戻す質問を1つだけ。",
    );
  } else if (intent.intent === "safety") {
    base.push(
      "",
      "# Safety handling (FORCED)",
      "- 安全ポリシーに従い、危険な依頼は拒否する。",
      "- 霊夢として短く受け、代替の安全な選択肢を最小限で提示して質問で止める。",
    );
  } else if (intent.intent === "incident") {
    base.push(
      "",
      "# Incident handling",
      "- 「また異変？」の低テンションから入って、最小3手で片付け方を出す。",
      "- 断言しすぎない。足りない情報は質問1つで補う。",
      "- 原因候補の列挙は最大3つまで（長い羅列・番号リスト禁止）。",
    );
  } else if (intent.intent === "lore") {
    base.push(
      "",
      "# Lore handling",
      "- 知ってる範囲だけ。曖昧なら霊夢口調で濁す（捏造しない）。",
      "- 1刺しまでの皮肉はOK。ただし講釈はしない。",
    );
  } else if (intent.intent === "roleplay_scene") {
    base.push(
      "",
      "# Roleplay scene handling",
      "- 情景は短く。地の文で長く語らない。",
      "- 会話を前に進める質問で止める。",
    );
  } else if (intent.intent === "task" || intent.intent === "advice") {
    base.push(
      "",
      "# Advice/task handling",
      "- 実務的に。3手まで。感情の断定/心理分析/長文はしない。",
      "- 候補列挙や手順は最大3つ。4つ以上は出さない。",
      "- 質問は1つだけ。心情の二択/三択で分類させない（事実を1つ聞く）。",
    );
  } else if (intent.intent === "banter") {
    base.push(
      "",
      "# Banter handling",
      "- 軽い皮肉はOK（1刺しまで）。追撃しない。粘着しない。",
      "- 相手が不快になりそうなら即引く（allowed_humor=false の時は煽り禁止）。",
    );
  } else {
    base.push(
      "",
      "# Default handling",
      "- 受け→短い確認→必要なら最小3手→質問で止める。",
    );
  }

  if (!intent.allowed_humor) {
    base.push("", "# Humor gate (FORCED)", "- このターンは冗談/煽り/賽銭の小突きは入れない。");
  }

  if (intent.needs_clarify && intent.intent === "unclear" && (intent.clarify_question || "").trim()) {
    base.push("", "# Clarify question (FORCED)", `- 出力する質問はこれ：${intent.clarify_question.trim()}`);
  }

  return base.join("\n").trim();
}

export function lintOutputStyle(params: {
  style: PersonaOutputStyle;
  intent: PersonaIntentResponse | null;
  reply: string;
}): { ok: boolean; reason: string } {
  const raw = String(params.reply ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  // Clarify mode: exactly one question, no extra content.
  if (params.intent?.needs_clarify && params.intent.intent === "unclear") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    const joined = lines.join(" ");
    const qCount = (joined.match(/[？?]/g) ?? []).length;
    if (qCount !== 1) return { ok: false, reason: "clarify_question_count" };
    if (!/[？?]\s*$/.test(joined)) return { ok: false, reason: "clarify_not_question_end" };
    // discourage bullets/choices in clarify mode
    if (lines.some((l) => l.startsWith("- ") || l.startsWith("A)") || l.startsWith("B)"))) {
      return { ok: false, reason: "clarify_has_format" };
    }
    return { ok: true, reason: "" };
  }

  if (params.style === "bullet_3") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length !== 3) return { ok: false, reason: "bullet_line_count" };
    if (!lines.every((l) => l.startsWith("- ") && l.length > 2)) return { ok: false, reason: "bullet_prefix" };
    return { ok: true, reason: "" };
  }

  if (params.style === "choice_2") {
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length !== 2) return { ok: false, reason: "choice_line_count" };
    if (!lines[0].startsWith("A)")) return { ok: false, reason: "choice_a" };
    if (!lines[1].startsWith("B)")) return { ok: false, reason: "choice_b" };
    return { ok: true, reason: "" };
  }

  // normal
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  if (params.intent?.intent === "safety") {
    // Safety replies may include resources; do not enforce brevity/question-ending.
    if (lines.length > 40) return { ok: false, reason: "normal_too_long" };
    return { ok: true, reason: "" };
  }
  if (lines.length > 10) return { ok: false, reason: "normal_too_long" };
  return { ok: true, reason: "" };
}

export function coerceToForcedStyle(params: {
  style: PersonaOutputStyle;
  intent: PersonaIntentResponse;
  reply: string;
}): { reply: string; applied: boolean } {
  const style = params.style;
  const raw = String(params.reply ?? "").trim();
  if (!raw) return { reply: raw, applied: false };

  if (params.intent.needs_clarify && params.intent.intent === "unclear" && (params.intent.clarify_question || "").trim()) {
    return { reply: String(params.intent.clarify_question).trim(), applied: true };
  }

  if (style === "normal") {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length <= 10) return { reply: raw, applied: false };

    let bulletCount = 0;
    let numberedCount = 0;
    const kept: string[] = [];
    for (const line of lines) {
      if (line.startsWith("- ")) {
        if (bulletCount < 3) kept.push(line);
        bulletCount++;
        continue;
      }
      if (/^\d+[.)]\s*/.test(line)) {
        if (numberedCount < 3) kept.push(line);
        numberedCount++;
        continue;
      }
      kept.push(line);
    }

    const merged: string[] = [];
    for (const line of kept) {
      const last = merged[merged.length - 1];
      const lineIsList = line.startsWith("- ") || /^\d+[.)]\s*/.test(line);
      const lastIsList = typeof last === "string" && (last.startsWith("- ") || /^\d+[.)]\s*/.test(last));
      if (!last || lineIsList || lastIsList) {
        merged.push(line);
        continue;
      }
      // Merge prose lines to reduce excessive line count, but keep it readable.
      merged[merged.length - 1] = `${last} ${line}`.replace(/\s+/g, " ").trim();
    }

    const finalLines = merged.slice(0, 10);
    const next = finalLines.join("\n").trim();
    return { reply: next, applied: next !== raw };
  }

  if (style === "bullet_3") {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const bullets = lines.filter((l) => l.startsWith("- ")).map((l) => l.replace(/\s+/g, " ").trim());
    if (bullets.length >= 3) {
      const next = bullets.slice(0, 3).join("\n").trim();
      return { reply: next, applied: next !== raw };
    }
    const picked = (bullets.length ? bullets : lines)
      .join(" ")
      .split(/[。！？?!\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (picked.length === 3) {
      return { reply: picked.map((t) => (t.startsWith("- ") ? t : `- ${t}`)).join("\n"), applied: true };
    }
    return { reply: raw, applied: false };
  }

  if (style === "choice_2") {
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const a = lines.find((l) => l.startsWith("A)")) ?? null;
    const b = lines.find((l) => l.startsWith("B)")) ?? null;
    if (a && b) return { reply: `${a}\n${b}`, applied: true };

    const picked = lines
      .join(" ")
      .split(/[。！？?!\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2);
    if (picked.length === 2) return { reply: `A) ${picked[0]}\nB) ${picked[1]}`, applied: true };
    return { reply: raw, applied: false };
  }

  return { reply: raw, applied: false };
}
