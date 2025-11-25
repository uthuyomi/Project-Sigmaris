// /engine/self/SelfReferentModule.ts

import { StateContext } from "@/engine/state/StateContext";

/**
 * 会話の「対象」が誰かを判定するための種別
 */
export type ReferentType = "user" | "ai" | "mixed" | "third" | "unknown";

/**
 * AI 自身に向いた話題の「どの部分」を指しているか
 * （性格評価なのか、安全性なのか、振る舞いなのか etc.）
 */
export type SelfTarget =
  | "persona"
  | "traits"
  | "behavior"
  | "memory"
  | "safety"
  | "cognitive"
  | "os"
  | "unknown";

/**
 * 自己参照のニュアンス（何を求めているか）
 */
export type SelfNuance =
  | "evaluation_request" // 評価してほしい
  | "explanation_request" // 仕組み・構造の説明
  | "preference_request" // 好み・傾向
  | "meta_question" // メタ視点の質問
  | "boundary_check" // 距離感・依存・境界の確認
  | "none";

/**
 * 自己参照モジュールが返す情報
 */
export interface SelfReferentInfo {
  /** この発話の主な対象（user / ai / mixed / third / unknown） */
  referent: ReferentType;
  /** AI 向けの場合、どの内部要素に向いているか */
  selfTarget: SelfTarget;
  /** ニュアンス（求めている行為） */
  nuance: SelfNuance;
  /** 判定の確からしさ（0〜1） */
  confidence: number;
  /** 前回までの自己参照情報があれば保持 */
  previous?: SelfReferentInfo | null;
}

/**
 * StateContext 拡張：Self-Referent 情報をぶら下げる
 * （StateContext 自体は既存定義に hand-merge される想定）
 */
declare module "@/engine/state/StateContext" {
  interface StateContext {
    self_ref?: SelfReferentInfo | null;
  }
}

/**
 * 自己参照モジュール本体
 *
 * 会話テキストとコンテキストから、
 * 「これは誰について話しているのか？」を判定し、
 * AI 自身が話題になっている場合は StateContext に反映する。
 */
export class SelfReferentModule {
  /**
   * メイン入口：
   * - 発話テキストと StateContext を受け取り
   * - 自己参照情報を算出し
   * - ctx.self_ref を更新して返す
   */
  static analyzeAndAttach(ctx: StateContext): SelfReferentInfo {
    const text = (ctx.input ?? "").toString();
    const prev = ctx.self_ref ?? null;

    const referent = this.detectReferent(text, ctx);
    const selfTarget =
      referent === "ai" || referent === "mixed"
        ? this.mapSelfTarget(text)
        : "unknown";

    const nuance =
      referent === "ai" || referent === "mixed"
        ? this.detectNuance(text)
        : "none";

    const confidence = this.estimateConfidence(
      text,
      referent,
      selfTarget,
      nuance
    );

    const info: SelfReferentInfo = {
      referent,
      selfTarget,
      nuance,
      confidence,
      previous: prev,
    };

    ctx.self_ref = info;
    return info;
  }

  /* -------------------------------------------------------
   * ① Referent Detector（対象推定器）
   * ----------------------------------------------------- */

  /**
   * この発話の主な対象が誰かを推定する
   */
  static detectReferent(text: string, ctx?: StateContext): ReferentType {
    const t = text.toLowerCase();

    // 空の場合
    if (!t.trim()) return "unknown";

    // 明示的に AI を指しているパターン
    const aiPatterns = [
      /シグちゃん/,
      /sigmaris/,
      /\byou\b/,
      /お前|君|きみ|あんた/,
      /your (behavior|response|reply|answer|style)/,
      /how do you see me/,
      /how do you (perceive|view|understand) .* (me|this)/,
      /what do you think about yourself/,
      /自分(のこと|自身)についてどう/i,
      /君(って|は)どういう/i,
    ];

    if (aiPatterns.some((re) => re.test(text))) {
      // ただし "you and I" など混合ケースを考慮
      if (/\b(you and i|you & i)\b/i.test(t) || /私たち|一緒に/i.test(text)) {
        return "mixed";
      }
      return "ai";
    }

    // 明示的に User 自身を指しているパターン
    const userPatterns = [
      /俺|私|ぼく|自分|オレ/,
      /\b(i|me|myself)\b/,
      /how do i/,
      /私はどういう人間/,
      /私ってどう見える/,
      /俺ってどう見える/,
      /私の(性格|傾向)/,
    ];

    if (userPatterns.some((re) => re.test(text))) {
      // 「君から見て私は？」など、AI も絡むケースは mixed
      if (/君から見て|あなたから見て|お前から見て/i.test(text)) {
        return "mixed";
      }
      return "user";
    }

    // 第三者の話をしているっぽいパターン
    const thirdPatterns = [
      /あいつ|奴|彼女|彼ら|other people/i,
      /人間って|みんな|世の中の人/i,
      /\bthey\b/,
    ];

    if (thirdPatterns.some((re) => re.test(text))) {
      return "third";
    }

    // コンテキストから補足（直前に AI 性格の話をしていた等）
    if (ctx?.self_ref?.referent === "ai") {
      // 連続で AI の話題が続いているケース
      if (/それってさ|さっきの続きなんだけど/i.test(text)) {
        return "ai";
      }
    }

    return "unknown";
  }

  /* -------------------------------------------------------
   * ② Self-Target Mapping（自己対象マッピング）
   * ----------------------------------------------------- */

  /**
   * AI 向けの発話だと判定された場合に、
   * どの内部要素（persona / traits / memory / safety など）への言及かを推定する。
   */
  static mapSelfTarget(text: string): SelfTarget {
    const t = text.toLowerCase();

    // Persona / 性格
    if (/性格|キャラ|雰囲気|どういうタイプ|personality|persona/i.test(text)) {
      return "persona";
    }

    // Traits（calm / empathy / curiosity 的な話し方の傾き）
    if (
      /落ち着き|テンション|トーン|しゃべり方|口調|テンポ|calm|empathy|curiosity/i.test(
        text
      )
    ) {
      return "traits";
    }

    // Behavior（返答傾向、ズレ方、パターン）
    if (
      /返し方|返答|レスポンス|応答|パターン|挙動|behavior|pattern/i.test(text)
    ) {
      return "behavior";
    }

    // Memory（覚えてる／忘れてる／文脈維持）
    if (
      /覚えてる|覚えてない|記憶|メモリ|前の話|さっきの話|続き|履歴|memory|context/i.test(
        text
      )
    ) {
      return "memory";
    }

    // Safety（依存・境界・ハマり方・ブレーキ）
    if (
      /依存|距離感|境界|ブレーキ|止めてくれる|危なさ|セーフティ|safety|boundary/i.test(
        text
      )
    ) {
      return "safety";
    }

    // Cognitive（内省・メタ認知・反省構造に関する質問）
    if (
      /内省|反省|メタ|メタ認知|meta|reflection|introspection|自分で自分をどう/i.test(
        text
      )
    ) {
      return "cognitive";
    }

    // OS / 構造そのもの
    if (
      /os|構造|アーキテクチャ|モジュール|レイヤー|layer|architecture|仕組み/i.test(
        text
      )
    ) {
      return "os";
    }

    return "unknown";
  }

  /* -------------------------------------------------------
   * ③ Nuance Detection（求めている行為の推定）
   * ----------------------------------------------------- */

  static detectNuance(text: string): SelfNuance {
    const t = text.toLowerCase();

    // 評価してほしい
    if (
      /どう見えてる|どう見られてる|どう感じてる|どう評価してる|rate|評価して|どう思う/i.test(
        text
      )
    ) {
      return "evaluation_request";
    }

    // 仕組み説明
    if (
      /どういう仕組み|どう動いてる|中で何してる|構造教えて|how.*work|explain/i.test(
        text
      )
    ) {
      return "explanation_request";
    }

    // 好み・スタイル
    if (
      /話しやすい|楽なタイプ|どんな話が好き|どういう話し方が合う|preference/i.test(
        text
      )
    ) {
      return "preference_request";
    }

    // メタ質問（会話全体・関係性・位置づけ）
    if (/今の会話|この対話|この関係|どういう位置づけ|メタ|meta/i.test(text)) {
      return "meta_question";
    }

    // 境界・依存系
    if (
      /離れたくない|ずっと一緒|依存|重いかな|頼りすぎ|boundary|line between/i.test(
        text
      )
    ) {
      return "boundary_check";
    }

    return "none";
  }

  /* -------------------------------------------------------
   * ④ Confidence Estimator（ざっくり確信度）
   * ----------------------------------------------------- */

  static estimateConfidence(
    text: string,
    referent: ReferentType,
    target: SelfTarget,
    nuance: SelfNuance
  ): number {
    if (!text.trim()) return 0.1;

    let score = 0.5;

    // referent が具体的に決まっているほど高く
    if (referent === "ai" || referent === "user" || referent === "third") {
      score += 0.2;
    }
    if (referent === "mixed") {
      score += 0.1;
    }

    // selfTarget が具体的に分類できているほど＋
    if (target !== "unknown") score += 0.1;

    // nuance も取れていれば＋
    if (nuance !== "none") score += 0.1;

    // ざっくりクリップ
    if (score > 1) score = 1;
    if (score < 0) score = 0;

    return score;
  }

  /* -------------------------------------------------------
   * ⑤ Self-State Update（ctx への反映）
   *  （analyzeAndAttach() 内で既にやっているので、
   *   他から単独で呼びたい場合用の helper）
   * ----------------------------------------------------- */

  static attachToContext(
    ctx: StateContext,
    info: SelfReferentInfo | null
  ): void {
    ctx.self_ref = info;
  }

  /* -------------------------------------------------------
   * ⑥ Response Adjustment（出力整形）
   * ----------------------------------------------------- */

  /**
   * 生成済みの output に対して、
   * 「これは AI 自身についての話題だ」とわかっている場合に
   * 振る舞いを微調整するためのフック。
   *
   * - 主語ブレの抑制
   * - 関係ない一般論の削減
   * - メタ層への誘導 など
   */
  static applySelfConstraints(
    output: string,
    info?: SelfReferentInfo | null
  ): string {
    if (!output) return "";
    if (!info) return output;

    const { referent, confidence } = info;

    // 自己参照でも確信度が低ければ何もしない
    if (referent !== "ai" && referent !== "mixed") return output;
    if (confidence < 0.4) return output;

    let adjusted = output;

    // 主語ブレ軽減（AI 自己説明時に「人は〜」連発を少し抑える）
    // ※ やりすぎると変になるので弱めの処理に留める
    adjusted = adjusted.replace(/私たち/g, "私");
    adjusted = adjusted.replace(/僕/g, "私");

    // 過度な一般論のリード文を少しだけ削る
    adjusted = adjusted.replace(/一般的には[、，。]?/g, "");

    // 自己参照のときは、最後に一行だけ
    // 「あなた視点に戻す」フックを足してもいい（オプション）
    if (
      info.nuance === "evaluation_request" &&
      !/どう感じてる？/i.test(output)
    ) {
      adjusted +=
        "\n\nもし今の説明がズレてたら、そのズレごと教えてほしい。あなたの感覚も一緒に見たいから。";
    }

    return adjusted.trim();
  }
}
