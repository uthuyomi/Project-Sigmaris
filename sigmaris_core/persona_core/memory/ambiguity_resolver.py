# sigmaris-core/persona_core/memory/ambiguity_resolver.py
# ----------------------------------------------------------
# Persona OS 完全版 — Ambiguity Resolver
#
# SelectiveRecall が返した MemoryPointer 群から、
# 曖昧参照（「それ」「前の」「続き」など）検出時のみ
# semantic re-ranking を行い、関連する pointer だけを残す。
#
# Persona OS 記憶パイプライン：
#   SelectiveRecall → AmbiguityResolver → EpisodeMerger → MemoryOrchestrator

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, List, Optional, Dict

from persona_core.types.core_types import PersonaRequest, MemoryPointer


# ==========================================================
# AmbiguityResolution — 解決結果
# ==========================================================

@dataclass
class AmbiguityResolution:
    resolved_pointers: List[MemoryPointer] = field(default_factory=list)
    discarded_pointers: List[MemoryPointer] = field(default_factory=list)
    reason: Optional[str] = None
    notes: Dict[str, Any] = field(default_factory=dict)


# ==========================================================
# AmbiguityResolver 本体
# ==========================================================

class AmbiguityResolver:
    """
    Persona OS 完全版 曖昧性解決レイヤ。

    - 曖昧語を検出（軽量な高速チェック）
    - semantic re-ranking（類似度再計算）
    - SelectiveRecall の pointer を「本当に今回 relevant なもの」に絞る

    MemoryOrchestrator → resolver.resolve(req=req, pointers=pointers)

    embedding_model 要件（最低限）:
      - encode(text: str) -> List[float] を実装していること
    """

    # 曖昧参照を示す語句（日本語/英語混在）
    AMBIGUOUS_TOKENS = [
        "それ", "前の", "続き", "あの件", "その話", "例のやつ", "あれ", "さっきの",
        "同じ話", "この前のやつ",
        "the last one", "previous one", "that thing",
    ]

    def __init__(
        self,
        *,
        embedding_model: Any,
        min_similarity: float = 0.15,
        max_resolve: int = 3,
    ) -> None:

        self._embed = embedding_model
        self._min_sim = float(min_similarity)
        self._max_resolve = int(max_resolve)

    # ------------------------------------------------------
    # (0) encode / cosine ユーティリティ
    # ------------------------------------------------------

    def _encode(self, text: str) -> Optional[List[float]]:
        """embedding_model.encode(...) を安全にラップ。失敗時は None。"""
        if not text:
            return None
        if not hasattr(self._embed, "encode"):
            return None
        try:
            vec = self._embed.encode(text)
        except Exception:
            return None

        # list / tuple 前提に正規化
        if not isinstance(vec, (list, tuple)):
            return None

        cleaned: List[float] = []
        for v in vec:
            try:
                cleaned.append(float(v))
            except Exception:
                # 数値化できない要素は捨てる
                continue

        return cleaned or None

    @staticmethod
    def _cosine(a: List[float], b: List[float]) -> float:
        """単純な cosine 類似度。ゼロベクトル時は 0.0。"""
        if not a or not b:
            return 0.0

        # 長さを揃える（短い方に合わせる）
        n = min(len(a), len(b))
        if n == 0:
            return 0.0

        dot = 0.0
        na = 0.0
        nb = 0.0
        for i in range(n):
            va = float(a[i])
            vb = float(b[i])
            dot += va * vb
            na += va * va
            nb += vb * vb

        if na <= 0.0 or nb <= 0.0:
            return 0.0

        return dot / (math.sqrt(na) * math.sqrt(nb))

    # ------------------------------------------------------
    # (1) 曖昧語検出
    # ------------------------------------------------------

    def _detect_ambiguity(self, message: str) -> bool:
        """
        入力メッセージに曖昧参照が含まれているかの高速チェック。
        """
        if not message:
            return False
        msg = message.lower()
        return any(token in msg for token in self.AMBIGUOUS_TOKENS)

    # ------------------------------------------------------
    # (2) semantic re-ranking（pointer の精製）
    # ------------------------------------------------------

    def _rerank(
        self,
        req: PersonaRequest,
        pointers: List[MemoryPointer],
    ) -> List[MemoryPointer]:
        """
        encode が使えない / 失敗した場合は「そのまま返す」安全設計。
        """
        if not pointers:
            return []

        # クエリ側ベクトル生成
        req_vec = self._encode(req.message or "")
        if req_vec is None:
            # embedding が利用できない場合は re-ranking 無し
            return pointers

        rescored: List[MemoryPointer] = []

        for p in pointers:
            text = p.summary or ""
            ep_vec = self._encode(text)
            if ep_vec is None:
                # そのエピソードだけスキップ
                continue

            try:
                sim = float(self._cosine(req_vec, ep_vec))
            except Exception:
                sim = 0.0

            # 類似度が最低ラインを下回るものは破棄
            if sim < self._min_sim:
                continue

            rescored.append(
                MemoryPointer(
                    episode_id=p.episode_id,
                    source=p.source,
                    score=sim,      # 再スコアリング結果に置換
                    summary=p.summary,
                )
            )

        # 類似度高い順（降順）
        rescored.sort(key=lambda x: x.score, reverse=True)
        return rescored

    # ------------------------------------------------------
    # (3) 公開 API — 曖昧性の解決
    # ------------------------------------------------------

    def resolve(
        self,
        *,
        req: PersonaRequest,
        pointers: List[MemoryPointer],
    ) -> AmbiguityResolution:

        message = req.message or ""

        # --------------------------------------------------
        # 曖昧語がない → pointer をそのまま返す
        # --------------------------------------------------
        if not self._detect_ambiguity(message):
            return AmbiguityResolution(
                resolved_pointers=pointers,
                discarded_pointers=[],
                reason="no ambiguity detected",
                notes={
                    "input": message,
                    "pointer_count": len(pointers),
                    "min_similarity": self._min_sim,
                    "max_resolve": self._max_resolve,
                },
            )

        # --------------------------------------------------
        # 曖昧語あり → semantic re-ranking
        # --------------------------------------------------
        reranked = self._rerank(req, pointers)

        # _rerank が encode 不可でフォールバックした場合は、
        # pointers がそのまま返ってくる → 「解決不能」とみなして全採用。
        if reranked is pointers:
            return AmbiguityResolution(
                resolved_pointers=pointers,
                discarded_pointers=[],
                reason="ambiguity detected but embedding unavailable; fallback to original pointers",
                notes={
                    "input": message,
                    "pointer_count": len(pointers),
                    "min_similarity": self._min_sim,
                    "max_resolve": self._max_resolve,
                },
            )

        # semantic に一致ゼロ → 全破棄
        if not reranked:
            return AmbiguityResolution(
                resolved_pointers=[],
                discarded_pointers=pointers,
                reason="ambiguity detected but no relevant memory",
                notes={
                    "input": message,
                    "original_count": len(pointers),
                    "min_similarity": self._min_sim,
                    "max_resolve": self._max_resolve,
                },
            )

        # --------------------------------------------------
        # Top-K（max_resolve）だけ残す
        # --------------------------------------------------
        top = reranked[: self._max_resolve]

        resolved_ids = {p.episode_id for p in top}
        discarded = [p for p in pointers if p.episode_id not in resolved_ids]

        return AmbiguityResolution(
            resolved_pointers=top,
            discarded_pointers=discarded,
            reason="ambiguity resolved by semantic reranking",
            notes={
                "input": message,
                "selected_count": len(top),
                "original_count": len(pointers),
                "min_similarity": self._min_sim,
                "max_resolve": self._max_resolve,
            },
        )