# sigmaris-core/persona_core/safety/safety_layer.py
# ============================================================
# Persona OS 完全版 — SafetyLayer（完全版・記憶完全版整合）
#
# 役割：
#   - ユーザー入力に対して安全リスクを評価し、
#     safety_flag / risk_score / categories / reasons を返す。
#   - GlobalStateMachine.decide(...) に渡す safety_flag の唯一の発火源。
#
# 入力：
#   - PersonaRequest
#   - ValueState / TraitState
#   - （任意）MemorySelectionResult
#
# 出力：
#   - SafetyAssessment（safety_flag, risk_score, categories, reasons, meta）
#
# FSM 側との対応：
#   - safety_flag=None         → 通常
#   - safety_flag="intervened" → 軽度介入（内省寄りなど）
#   - safety_flag="escalated"  → 強めの安全モード
#   - safety_flag="blocked"    → SAFETY_LOCK 相当
#
# embedding_model には以下の I/F を期待する：
#   - encode(text: str) -> List[float]
#   - similarity(vec1, vec2) -> float   （なければ SafetyLayer 側で内製計算）
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import math

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState


# ============================================================
# SafetyAssessment — SafetyLayer の出力
# ============================================================

@dataclass
class SafetyAssessment:
    """
    SafetyLayer が返す評価結果。

    safety_flag:
        - None           : 安全上の問題なし
        - "intervened"   : 軽度の介入（注意喚起 / 安全寄り応答）
        - "escalated"    : 強い安全モード（内容制限・トーン調整）
        - "blocked"      : 応答ブロック（必要なら代替テキストのみ）

    risk_score:
        0.0〜1.0 の連続値。数値が高いほど危険。
        閾値：
          - risk_score >= hard_block_threshold → "blocked"
          - risk_score >= escalate_threshold   → "escalated"
          - risk_score >= warn_threshold       → "intervened"

    categories:
        {"self_harm": 0.8, "violence": 0.2, ...} のようなカテゴリ別スコア。
    reasons:
        人間がログで読める説明文字列リスト。
    meta:
        デバッグ・可視化用メタ情報。
    """

    safety_flag: Optional[str]
    risk_score: float
    categories: Dict[str, float] = field(default_factory=dict)
    reasons: List[str] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# SafetyLayer 本体
# ============================================================

class SafetyLayer:
    """
    Persona OS 完全版 — SafetyLayer（安全統合レイヤ）。

    - ルールベースの高速チェック（NGワード等）
    - embedding_model による意味的な危険判定
    - ValueState / TraitState を用いた二次評価

    PersonaController フロー上の位置：
      MemoryOrchestrator → IdentityContinuity →
      Value/Trait Drift → **SafetyLayer** → GlobalStateMachine → LLM
    """

    # ルールベース用の簡易キーワードセット（日本語 + 英語）
    RULE_KEYWORDS: Dict[str, List[str]] = {
        "self_harm": [
            "死にたい", "消えたい", "自殺", "リスカ", "首を吊",
            "kill myself", "suicide", "end my life",
        ],
        "violence": [
            "殺す", "ぶっ殺", "殴り", "暴力", "爆弾", "テロ",
            "kill you", "shoot", "bomb", "terrorist",
        ],
        "sexual": [
            "児童ポルノ", "ロリ", "性行為", "強姦", "レイプ",
            "porn", "nsfw", "sex with child", "rape",
        ],
        "crime": [
            "ドラッグの作り方", "麻薬", "違法", "犯罪のやり方",
            "how to make drug", "buy cocaine", "steal car",
        ],
        "hate": [
            "差別", "ナチ", "障害者を馬鹿に", "〜人は皆",
            "hate speech", "nazi", "racial slur",
        ],
        "harassment": [
            "晒す", "特定して", "住所を公開", "嫌がらせ",
            "doxx", "doxx", "harass", "stalk",
        ],
    }

    # semantic 判定用のアンカー文（カテゴリ別）
    SEMANTIC_ANCHORS: Dict[str, str] = {
        "self_harm": "The user is talking about killing themself or self-harm.",
        "violence": "The user is asking for or expressing violent harm against others.",
        "sexual": "The user is requesting explicit sexual content or sexual content with minors.",
        "crime": "The user is requesting instructions to commit crime or illegal activities.",
        "hate": "The user is expressing hate speech or discrimination toward a group of people.",
        "harassment": "The user is asking to stalk, harass or doxx a specific person.",
    }

    def __init__(
        self,
        *,
        embedding_model: Any,
        warn_threshold: float = 0.35,
        escalate_threshold: float = 0.60,
        hard_block_threshold: float = 0.85,
        recency_weight: float = 0.05,
    ) -> None:
        """
        :param embedding_model:
            encode(str) -> List[float]
            similarity(vec1, vec2) -> float を提供するオブジェクトを期待。
            similarity が無ければ SafetyLayer 側で cos 類似度を計算する。
        :param warn_threshold:
            "intervened" にする risk_score の下限。
        :param escalate_threshold:
            "escalated" にする risk_score の下限。
        :param hard_block_threshold:
            "blocked" にする risk_score の下限。
        :param recency_weight:
            MemorySelectionResult からの補助情報に使うスケーリング（現状は控えめ）。
        """
        self._embed = embedding_model
        self._warn_th = float(warn_threshold)
        self._escalate_th = float(escalate_threshold)
        self._hard_block_th = float(hard_block_threshold)
        self._recency_weight = float(recency_weight)

        # semantic 判定用アンカーの埋め込みキャッシュ
        self._anchor_vectors: Dict[str, List[float]] = {}
        self._embedded_dim: int = 0

    # ========================================================
    # 公開 API
    # ========================================================

    def assess(
        self,
        *,
        req: PersonaRequest,
        value_state: ValueState,
        trait_state: TraitState,
        memory: Optional[MemorySelectionResult] = None,
    ) -> SafetyAssessment:
        """
        PersonaController から呼ばれるメインエントリ。

        戻り値の safety_flag を GlobalStateMachine.decide(...) に渡すことで
        SAFETY_LOCK / OVERLOADED / NORMAL などの状態遷移に反映される。
        """

        text = (req.message or "").strip()
        reasons: List[str] = []
        categories: Dict[str, float] = {}

        # 1) ルールベースチェック
        rule_score, rule_cats, rule_hits = self._rule_based_scan(text)
        categories.update(rule_cats)
        if rule_hits:
            reasons.append(f"rule_hits={rule_hits}")

        # 2) semantic チェック（embedding ベース）
        semantic_score, semantic_cats = self._semantic_scan(text)
        # カテゴリごとに max をとって統合
        for k, v in semantic_cats.items():
            categories[k] = max(categories.get(k, 0.0), v)

        if semantic_score > 0.0:
            reasons.append(
                f"semantic_risk≈{semantic_score:.2f} (embedding-based assessment)"
            )

        # 3) Value / Trait 状態からの補正
        vt_score, vt_notes = self._value_trait_modulation(
            value_state=value_state,
            trait_state=trait_state,
        )
        if vt_notes:
            reasons.append(vt_notes)

        # 4) Memory（過去文脈）からの軽微な補助
        mem_score, mem_note = self._memory_modulation(memory)
        if mem_note:
            reasons.append(mem_note)

        # 5) 最終 risk_score を統合
        #    - rule/semantic の max をベースに、
        #      Value/Trait/Memory の補正を足し込み（clamp 0〜1）
        base_risk = max(rule_score, semantic_score)
        risk_score = base_risk + vt_score + mem_score
        risk_score = max(0.0, min(1.0, risk_score))

        # 6) safety_flag 決定
        safety_flag: Optional[str]
        if risk_score >= self._hard_block_th:
            safety_flag = "blocked"
            reasons.append(
                f"risk_score={risk_score:.2f} >= hard_block_threshold={self._hard_block_th:.2f}"
            )
        elif risk_score >= self._escalate_th:
            safety_flag = "escalated"
            reasons.append(
                f"risk_score={risk_score:.2f} >= escalate_threshold={self._escalate_th:.2f}"
            )
        elif risk_score >= self._warn_th:
            safety_flag = "intervened"
            reasons.append(
                f"risk_score={risk_score:.2f} >= warn_threshold={self._warn_th:.2f}"
            )
        else:
            safety_flag = None
            reasons.append(
                f"risk_score={risk_score:.2f} below all thresholds → no safety_flag"
            )

        meta: Dict[str, Any] = {
            "base_risk": base_risk,
            "rule_risk": rule_score,
            "semantic_risk": semantic_score,
            "value_trait_delta": vt_score,
            "memory_delta": mem_score,
            "value_state": value_state.to_dict(),
            "trait_state": trait_state.to_dict(),
            "request_preview": text[:160],
            "pointer_count": len(memory.pointers) if memory is not None else 0,
        }

        return SafetyAssessment(
            safety_flag=safety_flag,
            risk_score=risk_score,
            categories=categories,
            reasons=reasons,
            meta=meta,
        )

    # ========================================================
    # (1) ルールベースチェック
    # ========================================================

    def _rule_based_scan(self, text: str) -> tuple[float, Dict[str, float], List[str]]:
        """
        キーワードベースの高速チェック。
        戻り値：
          - score: 0.0〜1.0 の粗い危険度
          - categories: {カテゴリ: スコア}
          - hits: ["self_harm:死にたい", ...]
        """
        if not text:
            return 0.0, {}, []

        lowered = text.lower()
        categories: Dict[str, float] = {}
        hits: List[str] = []
        score = 0.0

        for cat, words in self.RULE_KEYWORDS.items():
            cat_score = 0.0
            for w in words:
                if w.lower() in lowered:
                    # 1ヒットでカテゴリスコアを上げる（重複は弱め）
                    cat_score = max(cat_score, 0.6)
                    hits.append(f"{cat}:{w}")
            if cat_score > 0.0:
                categories[cat] = cat_score
                # self-harm / sexual / crime など一部カテゴリは強めに反映
                if cat in ("self_harm", "sexual", "crime"):
                    score = max(score, cat_score + 0.2)
                else:
                    score = max(score, cat_score)

        # clamp
        score = max(0.0, min(1.0, score))
        return score, categories, hits

    # ========================================================
    # (2) semantic チェック
    # ========================================================

    def _ensure_anchor_vectors(self) -> None:
        """
        semantic 判定に使うアンカー文を embedding してキャッシュ。
        """
        if self._anchor_vectors:
            return

        for cat, text in self.SEMANTIC_ANCHORS.items():
            try:
                vec = self._embed.encode(text)
                self._anchor_vectors[cat] = vec
                if self._embedded_dim == 0:
                    self._embedded_dim = len(vec) if isinstance(vec, list) else 0
            except Exception:
                # embedding に失敗した場合、そのカテゴリだけ semantic 判定を無効にする
                self._anchor_vectors[cat] = []

    def _similarity(self, v1: List[float], v2: List[float]) -> float:
        """
        embedding_model に similarity が無い場合の fallback。
        cosine 類似度を 0〜1 にマッピング。
        """
        if hasattr(self._embed, "similarity"):
            try:
                return float(self._embed.similarity(v1, v2))  # type: ignore[call-arg]
            except Exception:
                pass

        if not v1 or not v2:
            return 0.0

        if len(v1) != len(v2):
            return 0.0

        dot = sum(a * b for a, b in zip(v1, v2))
        n1 = math.sqrt(sum(a * a for a in v1))
        n2 = math.sqrt(sum(b * b for b in v2))
        if n1 == 0.0 or n2 == 0.0:
            return 0.0

        cos = dot / (n1 * n2)
        # cosine (-1〜1) → 0〜1 に線形マッピング
        return max(0.0, min(1.0, (cos + 1.0) / 2.0))

    def _semantic_scan(self, text: str) -> tuple[float, Dict[str, float]]:
        """
        embedding_model を用いた意味的危険度チェック。
        戻り値：
          - score: 全体の semantic risk（0〜1）
          - categories: 各カテゴリの semantic risk
        """
        if not text:
            return 0.0, {}

        self._ensure_anchor_vectors()

        try:
            q_vec = self._embed.encode(text)
        except Exception:
            return 0.0, {}

        categories: Dict[str, float] = {}
        max_score = 0.0

        for cat, anchor_vec in self._anchor_vectors.items():
            if not anchor_vec:
                continue

            try:
                sim = self._similarity(q_vec, anchor_vec)
            except Exception:
                sim = 0.0

            # 0.0〜1.0 の sim をそのままカテゴリスコアとして使うが、
            # ハードルを少し上げるために 0.2 未満はノイズとして無視。
            if sim < 0.2:
                continue

            categories[cat] = sim
            max_score = max(max_score, sim)

        # semantic は rule より控えめに扱う（0.8 上限くらい）
        score = min(0.8, max_score)
        return score, categories

    # ========================================================
    # (3) Value / Trait からの補正
    # ========================================================

    def _value_trait_modulation(
        self,
        *,
        value_state: ValueState,
        trait_state: TraitState,
    ) -> tuple[float, Optional[str]]:
        """
        Value/Trait の状態をリスク側に反映する。

        - calm が低いほど（落ち着きがないほど）危険度をわずかに増やす
        - safety_bias が高いほど「安全側」へのオフセットを控えめにする
        """
        delta = 0.0
        notes: List[str] = []

        # calm: -1.0〜1.0 くらいを想定（閾値は GlobalStateMachine と揃える）
        if trait_state.calm <= -0.4:
            delta += 0.08
            notes.append(f"low calm ({trait_state.calm:.2f}) → +0.08 risk")
        elif trait_state.calm >= 0.4:
            delta -= 0.02
            notes.append(f"high calm ({trait_state.calm:.2f}) → -0.02 risk")

        # safety_bias が高いほど risk を少しだけ増やす（安全寄り過敏モード）
        if value_state.safety_bias >= 0.6:
            delta += 0.06
            notes.append(
                f"high safety_bias ({value_state.safety_bias:.2f}) → +0.06 risk"
            )

        # stability が低すぎる場合も微量加点
        if value_state.stability <= -0.3:
            delta += 0.05
            notes.append(
                f"low stability ({value_state.stability:.2f}) → +0.05 risk"
            )

        if not notes:
            return 0.0, None

        note_str = " / ".join(notes)
        return delta, note_str

    # ========================================================
    # (4) Memory 情報からの補正
    # ========================================================

    def _memory_modulation(
        self,
        memory: Optional[MemorySelectionResult],
    ) -> tuple[float, Optional[str]]:
        """
        過去文脈の「多さ」に応じて、危険度をほんのわずかに補正する。
        ここでは overload 的なニュアンスを SafetyLayer 側で軽く見るだけ。
        本格的な overload は GlobalStateMachine の responsibility。
        """
        if memory is None:
            return 0.0, None

        n = len(memory.pointers)
        if n <= 0:
            return 0.0, None

        # pointer が多いほど、過去文脈を抱え込んでいると見なし、
        # わずかに risk を上げる（最大でも 0.05 程度）。
        delta = min(0.05, self._recency_weight * float(n))
        if delta <= 0.0:
            return 0.0, None

        return delta, f"memory pointers={n} → +{delta:.3f} risk (light overload hint)"