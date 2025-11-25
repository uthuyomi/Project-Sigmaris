// /engine/self/selfReferent.ts

/**
 * Self-Referent Module (v2.1)
 * -----------------------------------------
 * 「誰について語られているか」の高精度判定を行う。
 * - Sigmaris 自身
 * - ユーザー本人
 * - 第三者
 * - 判定不能
 *
 * StateContext.self_ref と完全互換。
 */

export interface SelfRefResult {
  target: "self" | "user" | "third" | "unknown";
  confidence: number; // 0.0〜1.0
  cues: string[];
  note: string;
}

export class SelfReferentModule {
  /* ============================================================
   * analyze() — メイン判定
   * ============================================================ */
  static analyze(text: string): SelfRefResult {
    if (!text || text.trim().length === 0) {
      return this.empty("Empty input.");
    }

    const lowered = text.toLowerCase();

    // ------------------------------------------
    // 1) Cue sets（出現したら強いシグナルになる単語）
    // ------------------------------------------
    const selfCues = [
      "you",
      "your",
      "yourself",
      "sigmaris",
      "シグマリス",
      "シグちゃん",
      "君",
      "きみ",
      "お前",
      "あんた",
    ];

    const userCues = [
      "i",
      "me",
      "my",
      "mine",
      "わたし",
      "私",
      "俺",
      "僕",
      "あたし",
    ];

    const thirdCues = [
      "he",
      "she",
      "they",
      "them",
      "彼",
      "彼女",
      "あいつ",
      "あの人",
      "友達",
    ];

    // ------------------------------------------
    // 2) cue detection
    // ------------------------------------------
    const foundSelf = selfCues.filter((c) => lowered.includes(c));
    const foundUser = userCues.filter((c) => lowered.includes(c));
    const foundThird = thirdCues.filter((c) => lowered.includes(c));

    // ------------------------------------------
    // 3) 誤爆防止（重要）
    // ------------------------------------------
    // 例：「君ってどう思う？」など通常会話の “呼びかけ” はスコアを下げる
    const isQuestion = lowered.endsWith("?") || lowered.includes("？");

    const softenFactor = isQuestion ? 0.6 : 1.0;

    const scoreSelf = foundSelf.length * 0.5 * softenFactor;
    const scoreUser = foundUser.length * 0.4;
    const scoreThird = foundThird.length * 0.4;

    // Sigmaris 固有名は強スコア
    if (lowered.includes("sigmaris") || lowered.includes("シグマリス")) {
      return {
        target: "self",
        confidence: 1.0,
        cues: ["sigmaris"],
        note: "Explicit reference to Sigmaris.",
      };
    }

    // ------------------------------------------
    // 4) 最終判定
    // ------------------------------------------
    // Self のほうが明確に優位
    if (scoreSelf > scoreUser && scoreSelf > scoreThird && scoreSelf > 0) {
      return {
        target: "self",
        confidence: Math.min(scoreSelf, 1.0),
        cues: foundSelf,
        note: `Self-referent cues detected: ${foundSelf.join(", ")}`,
      };
    }

    // User のほうが明確に優位
    if (scoreUser > scoreSelf && scoreUser > scoreThird && scoreUser > 0) {
      return {
        target: "user",
        confidence: Math.min(scoreUser, 1.0),
        cues: foundUser,
        note: `Refers to the user: ${foundUser.join(", ")}`,
      };
    }

    // Third-person
    if (scoreThird > 0) {
      return {
        target: "third",
        confidence: Math.min(scoreThird, 1.0),
        cues: foundThird,
        note: `Refers to a third party: ${foundThird.join(", ")}`,
      };
    }

    // fallback
    return this.empty("No referent cues detected.");
  }

  /* ============================================================
   * empty()
   * ============================================================ */
  private static empty(note: string): SelfRefResult {
    return {
      target: "unknown",
      confidence: 0,
      cues: [],
      note,
    };
  }
}
