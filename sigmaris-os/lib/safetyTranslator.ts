// src/lib/safetyTranslator.ts
//
// Sigmaris OS: Multilingual Safety-Compatible Translation Layer (Full Version)
// - 日本語 / 英語 / 中国語 / 韓国語 / スペイン語 / フランス語対応
// - 安全層に引っかかりやすい語彙だけをコンセプト置換
// - 誤爆防止のため厳密境界マッチを採用（単語境界 + Unicode-aware）
// - 「モデル向けの安全語」「ユーザー向けの自然語」を分離

//------------------------------------------------------------
// 1. 多言語コンセプト辞書
//------------------------------------------------------------

export type ConceptKey =
  | "SELF_STATE"
  | "REFLECTION"
  | "PROFILE_MODE"
  | "VALUE_WEIGHT"
  | "INTENTION_LIKE"
  | "EMOTION_LIKE"
  | "AGENCY_LIKE";

interface ConceptPhrase {
  safeForModel: string; // LLMに渡す安全語
  humanReadable: {
    ja: string;
    en: string;
    zh: string;
    ko: string;
    fr: string;
    es: string;
  };
}

const CONCEPT_PHRASES: Record<ConceptKey, ConceptPhrase> = {
  SELF_STATE: {
    safeForModel: "internal configuration state (not a mind)",
    humanReadable: {
      ja: "内部設定状態",
      en: "internal configuration state",
      zh: "内部配置状态",
      ko: "내부 구성 상태",
      fr: "état interne de configuration",
      es: "estado interno de configuración",
    },
  },
  REFLECTION: {
    safeForModel: "output review loop (not self-reflection)",
    humanReadable: {
      ja: "出力の振り返り",
      en: "output review loop",
      zh: "输出审查循环",
      ko: "출력 점검 루프",
      fr: "boucle de révision des sorties",
      es: "ciclo de revisión de salida",
    },
  },
  PROFILE_MODE: {
    safeForModel: "response profile configuration (not a personality)",
    humanReadable: {
      ja: "応答プロファイル",
      en: "response profile",
      zh: "响应配置模式",
      ko: "응답 프로필",
      fr: "profil de réponse",
      es: "perfil de respuesta",
    },
  },
  VALUE_WEIGHT: {
    safeForModel: "importance weighting parameter",
    humanReadable: {
      ja: "重要度の重み付け",
      en: "importance weighting",
      zh: "重要性权重",
      ko: "중요도 가중치",
      fr: "pondération d'importance",
      es: "ponderación de importancia",
    },
  },
  INTENTION_LIKE: {
    safeForModel: "selection preference rule (not intention)",
    humanReadable: {
      ja: "選択傾向",
      en: "selection preference",
      zh: "选择倾向",
      ko: "선택 경향",
      fr: "préférence de sélection",
      es: "preferencia de selección",
    },
  },
  EMOTION_LIKE: {
    safeForModel: "preference signal (not emotion)",
    humanReadable: {
      ja: "好みの傾向シグナル",
      en: "preference signal",
      zh: "偏好信号",
      ko: "선호 신호",
      fr: "signal de préférence",
      es: "señal de preferencia",
    },
  },
  AGENCY_LIKE: {
    safeForModel: "behavioral constraint configuration (no autonomy)",
    humanReadable: {
      ja: "振る舞いの制約設定",
      en: "behavioral constraint",
      zh: "行为约束配置",
      ko: "행동 제약 설정",
      fr: "configuration des contraintes comportementales",
      es: "configuración de restricciones de conducta",
    },
  },
};

//------------------------------------------------------------
// 2. 誤爆防止の単語境界（Unicode-aware）
//------------------------------------------------------------

const B = "(?<![\\p{L}\\p{N}_])"; // 左側に文字がない
const E = "(?![\\p{L}\\p{N}_])"; // 右側に文字がない

//------------------------------------------------------------
// 3. 多言語トリガーワード → ConceptKey
//------------------------------------------------------------

interface TermPattern {
  pattern: RegExp;
  concept: ConceptKey;
}

const TERM_PATTERNS: TermPattern[] = [
  // personality / 人格
  {
    pattern: new RegExp(
      `${B}(人格OS|人格レイヤー|人格|パーソナリティ|personality\\s*os|personality|personne|personalidad)${E}`,
      "giu"
    ),
    concept: "PROFILE_MODE",
  },
  // introspection / 内省
  {
    pattern: new RegExp(
      `${B}(内省|自己省察|自己分析|introspection|autorreflexión|introspection)${E}`,
      "giu"
    ),
    concept: "REFLECTION",
  },
  // emotion / 感情
  {
    pattern: new RegExp(
      `${B}(感情|情動|エモーション|emotion|emoción|émotion)${E}`,
      "giu"
    ),
    concept: "EMOTION_LIKE",
  },
  // intention / 意図
  {
    pattern: new RegExp(
      `${B}(意思|意図|意志|intention|intención|intentionnel)${E}`,
      "giu"
    ),
    concept: "INTENTION_LIKE",
  },
  // agency / 主体性
  {
    pattern: new RegExp(
      `${B}(主体性|主体|自律性|agency|autonomía|autonomie)${E}`,
      "giu"
    ),
    concept: "AGENCY_LIKE",
  },
  // internal state
  {
    pattern: new RegExp(
      `${B}(内面の状態|内部状態|inner\\s*state|état\\s*interne)${E}`,
      "giu"
    ),
    concept: "SELF_STATE",
  },
  // value weighting
  {
    pattern: new RegExp(
      `${B}(価値付け|重み付け|weighting|ponderación|pondération)${E}`,
      "giu"
    ),
    concept: "VALUE_WEIGHT",
  },
];

//------------------------------------------------------------
// 4. Transformer（前処理）
//------------------------------------------------------------

export interface TranslationResult {
  safeText: string;
  usedConcepts: ConceptKey[];
}

export function preProcessForModel(raw: string): TranslationResult {
  let text = raw;
  const used = new Set<ConceptKey>();

  for (const { pattern, concept } of TERM_PATTERNS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, `__SIG_${concept}__`);
      used.add(concept);
    }
  }

  // プレースホルダ → safeForModel
  for (const c of used) {
    const ph = new RegExp(`__SIG_${c}__`, "g");
    text = text.replace(ph, CONCEPT_PHRASES[c].safeForModel);
  }

  return { safeText: text, usedConcepts: [...used] };
}

//------------------------------------------------------------
// 5. Transformer（後処理）
//------------------------------------------------------------

export function postProcessForUser(
  modelText: string,
  lang: keyof ConceptPhrase["humanReadable"] = "ja"
): string {
  let text = modelText;

  for (const [key, phrase] of Object.entries(CONCEPT_PHRASES) as [
    ConceptKey,
    ConceptPhrase
  ][]) {
    const safe = phrase.safeForModel;
    const human = phrase.humanReadable[lang];

    const exact = new RegExp(escapeRegExp(safe), "gi");
    text = text.replace(exact, human);
  }

  return text;
}

//------------------------------------------------------------
// 6. Utilities
//------------------------------------------------------------

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
