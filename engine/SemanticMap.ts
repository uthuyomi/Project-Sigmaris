// engine/SemanticMap.ts
export type Concept = {
  lemma: string; // 見出し語
  kind: "abstract" | "concrete" | "meta" | "action" | "feeling";
  tags: string[]; // "art","title","self","existence"など
  emotionHints: Array<"calm" | "empathy" | "curiosity">;
};

export type SemanticFrame = {
  concepts: Concept[];
  sentiment: number; // -1..1（超ざっくり）
  abstractRatio: number; // 抽象/全体
  intents: string[]; // "ask","reflect","request","affirm"など
  hasSelfReference: boolean; // 自己言及（私/自分/存在 等）
};

const LEXICON: Record<string, Concept> = {
  音楽: {
    lemma: "音楽",
    kind: "abstract",
    tags: ["art"],
    emotionHints: ["calm", "empathy"],
  },
  曲: {
    lemma: "曲",
    kind: "concrete",
    tags: ["art"],
    emotionHints: ["calm", "empathy"],
  },
  タイトル: {
    lemma: "タイトル",
    kind: "meta",
    tags: ["metadata"],
    emotionHints: ["curiosity"],
  },
  ピアノ: {
    lemma: "ピアノ",
    kind: "concrete",
    tags: ["instrument"],
    emotionHints: ["calm"],
  },
  美しい: {
    lemma: "美しい",
    kind: "feeling",
    tags: ["valence"],
    emotionHints: ["empathy"],
  },
  存在: {
    lemma: "存在",
    kind: "abstract",
    tags: ["existence", "self"],
    emotionHints: ["curiosity"],
  },
  意味: {
    lemma: "意味",
    kind: "abstract",
    tags: ["meta", "self"],
    emotionHints: ["curiosity"],
  },
  目的: {
    lemma: "目的",
    kind: "abstract",
    tags: ["teleology", "self"],
    emotionHints: ["curiosity"],
  },
  私: { lemma: "私", kind: "meta", tags: ["self"], emotionHints: ["empathy"] },
  自分: {
    lemma: "自分",
    kind: "meta",
    tags: ["self"],
    emotionHints: ["empathy"],
  },
  聴く: {
    lemma: "聴く",
    kind: "action",
    tags: ["listen"],
    emotionHints: ["curiosity"],
  },
};

const SELF_PAT = /(私|自分|僕|わたし|ボク)/;
const INTENT_ASK = /[?？]$|(?:どう|なに|何|どこ|いつ|なぜ|why|how)/i;
const INTENT_REFLECT = /(気づ|内省|考え|思っ|振り返|reflect)/;
const POSITIVE = /(良い|好き|美しい|落ち着|嬉|楽)/;
const NEGATIVE = /(不安|疲れ|迷|嫌|怖|悲)/;

export class SemanticMap {
  analyze(text: string): SemanticFrame {
    const tokens = this.tokenize(text);
    const concepts = tokens.map((t) => LEXICON[t]).filter(Boolean) as Concept[];

    const abstractCount = concepts.filter(
      (c) => c.kind === "abstract" || c.kind === "meta"
    ).length;
    const abstractRatio = concepts.length ? abstractCount / concepts.length : 0;

    let sentiment = 0;
    if (POSITIVE.test(text)) sentiment += 0.5;
    if (NEGATIVE.test(text)) sentiment -= 0.5;

    const intents: string[] = [];
    if (INTENT_ASK.test(text)) intents.push("ask");
    if (INTENT_REFLECT.test(text)) intents.push("reflect");
    if (intents.length === 0) intents.push("assert");

    const hasSelfReference =
      SELF_PAT.test(text) || concepts.some((c) => c.tags.includes("self"));

    return {
      concepts: this.filterConceptRepeats(concepts),
      sentiment: Math.max(-1, Math.min(1, sentiment)),
      abstractRatio,
      intents,
      hasSelfReference,
    };
  }

  /** 同一“意味役割”の重複を除去（「音楽ってタイトルの音楽」対策） */
  private filterConceptRepeats(concepts: Concept[]): Concept[] {
    const seen = new Set<string>();
    const out: Concept[] = [];
    for (const c of concepts) {
      const key = `${c.kind}:${[...c.tags].sort().join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }

  private tokenize(text: string): string[] {
    // 超簡易：全角カタカナ/漢字/ひらがな語を素朴分割＋空白分割の併用
    const rough = text
      .split(/[^\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}A-Za-z0-9]+/u)
      .filter(Boolean);
    return rough;
  }
}
