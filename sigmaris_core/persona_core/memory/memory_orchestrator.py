# sigmaris-core/persona_core/memory/memory_orchestrator.py
# ----------------------------------------------------------
# Persona OS 完全版 — Memory Integration Orchestrator
#
# 役割：
#   - Selective Recall（記憶候補抽出）
#   - Ambiguity Resolver（曖昧性除去）
#   - EpisodeMerger（過去文脈統合要約）
#   - （追加）Long-term Memory Search（全文・長期掘り返し）
#
# 方針：
#   - 既存構造は一切削らず、後方互換を維持
#   - Long-term search は「強制」ではなく、トリガー一致時のみ呼び出す
#   - Search 結果は pointers には混ぜず、raw/meta にのみ載せる（既存挙動不変）
# ----------------------------------------------------------

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from persona_core.types.core_types import PersonaRequest, MemoryPointer
from persona_core.memory.selective_recall import SelectiveRecall
from persona_core.memory.episode_merger import EpisodeMerger, EpisodeMergeResult
from persona_core.memory.ambiguity_resolver import (
    AmbiguityResolver,
    AmbiguityResolution,
)

# ----------------------------------------------------------
# Optional Long-term Memory Search Engine
# ----------------------------------------------------------
try:
    from persona_core.memory.memory_search_engine import MemorySearchEngine
except Exception:  # pragma: no cover
    MemorySearchEngine = None  # type: ignore


# ==========================================================
# MemorySelectionResult — PersonaController が利用する形式
# ==========================================================

@dataclass
class MemorySelectionResult:
    """
    MemoryOrchestrator から PersonaController へ返す結果。

    - pointers:
        今回のターンで「参照すべき」と判断された MemoryPointer 群。
    - merged_summary:
        EpisodeMerger によって統合された過去文脈 summary。
    - raw:
        デバッグ・ログ・UI 用のメタ情報（後方互換）。
        ※ long-term search 結果は raw["memory_search"] に格納。
    """

    pointers: List[MemoryPointer] = field(default_factory=list)
    merged_summary: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)


# ==========================================================
# MemoryOrchestrator
# ==========================================================

class MemoryOrchestrator:
    """
    Persona OS 完全版 メモリ統合の中心レイヤ。

    Pipeline（既存）:
        1) SelectiveRecall
        2) AmbiguityResolver
        3) EpisodeMerger

    Pipeline（追加・任意）:
        4) MemorySearchEngine（全文・長期検索）
           - トリガー一致時のみ実行
           - pointers には影響しない
    """

    def __init__(
        self,
        *,
        selective_recall: SelectiveRecall,
        episode_merger: EpisodeMerger,
        ambiguity_resolver: AmbiguityResolver,
        memory_search_engine: Optional[Any] = None,
    ) -> None:
        self._recall = selective_recall
        self._merger = episode_merger
        self._ambiguity = ambiguity_resolver
        self._memory_search = memory_search_engine

    # -----------------------------------------------------
    # Trigger 判定（強制検索しない）
    # -----------------------------------------------------

    def _should_invoke_memory_search(self, text: Optional[str]) -> bool:
        """
        長期掘り返しが必要な発話のみ True。

        - 日本語 / 英語対応
        - 部分一致で十分
        """
        if not text:
            return False

        t = text.strip().lower()
        if not t:
            return False

        triggers = [
            # 日本語
            "覚えて", "思い出", "前の話", "その前", "前回", "以前",
            "この前", "さっき何の話", "何の話", "どんな話",
            "話してた", "掘り返", "記憶", "履歴", "ログ",
            "過去", "昔の", "前に言った", "前に話した",
            "前のやりとり", "前の会話", "会話の内容",
            # English
            "do you remember", "do you recall",
            "can you recall", "can you remember",
            "what did we talk about", "what were we talking about",
            "before that", "earlier", "previously",
            "last time", "in our previous conversation",
            "from earlier in the chat",
            "conversation history", "chat history",
            "what did i say", "what did you say",
        ]

        return any(k in t for k in triggers)

    # -----------------------------------------------------
    # Main pipeline
    # -----------------------------------------------------

    def select_for_request(
        self,
        req: PersonaRequest,
        **backend_kwargs: Any,
    ) -> MemorySelectionResult:

        debug_raw: Dict[str, Any] = {
            "request_preview": (req.message or "")[:120],
        }

        # ==================================================
        # (1) Selective Recall
        # ==================================================
        pointers = self._recall.recall(req=req, **backend_kwargs)
        debug_raw["initial_pointer_count"] = len(pointers)

        # ==================================================
        # (1.5) Long-term Memory Search（任意）
        # ==================================================
        if self._memory_search and self._should_invoke_memory_search(req.message):
            try:
                user_id = backend_kwargs.get("user_id") or getattr(req, "user_id", None)
                session_id = getattr(req, "session_id", None)

                result = self._memory_search.search(
                    user_id=user_id,
                    query=req.message,
                    session_id=session_id,
                )

                debug_raw["memory_search"] = {
                    "hit_count": getattr(result, "hit_count", None),
                    "topic_label": getattr(result, "topic_label", None),
                    "preview": getattr(result, "memory_preview", None),
                    "engine": type(self._memory_search).__name__,
                }
            except Exception as e:
                debug_raw["memory_search_error"] = str(e)

        if not pointers:
            debug_raw["info"] = "no memory pointers selected by SelectiveRecall"
            return MemorySelectionResult(
                pointers=[],
                merged_summary=None,
                raw=debug_raw,
            )

        # ==================================================
        # (2) Ambiguity Resolver
        # ==================================================
        ambiguity: AmbiguityResolution = self._ambiguity.resolve(
            req=req,
            pointers=pointers,
        )

        debug_raw["ambiguity"] = {
            "reason": ambiguity.reason,
            "resolved_count": len(ambiguity.resolved_pointers),
            "discarded_count": len(ambiguity.discarded_pointers),
            "notes": ambiguity.notes,
        }

        active_pointers = ambiguity.resolved_pointers
        if not active_pointers:
            debug_raw["info"] = "ambiguity resolved but no relevant memory left"
            return MemorySelectionResult(
                pointers=[],
                merged_summary=None,
                raw=debug_raw,
            )

        # ==================================================
        # (3) Episode Merger
        # ==================================================
        merge: EpisodeMergeResult = self._merger.merge(
            req=req,
            pointers=active_pointers,
        )

        debug_raw["merge"] = {
            "notes": merge.notes,
            "raw_segments_count": len(merge.raw_segments),
            "used_pointers_count": len(merge.used_pointers),
        }

        return MemorySelectionResult(
            pointers=merge.used_pointers,
            merged_summary=merge.summary,
            raw=debug_raw,
        )

    # -----------------------------------------------------
    # PersonaController 互換 API
    # -----------------------------------------------------

    def select(
        self,
        req: PersonaRequest,
        **backend_kwargs: Any,
    ) -> MemorySelectionResult:
        return self.select_for_request(req=req, **backend_kwargs)