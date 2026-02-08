# sigmaris-core/persona_core/identity/identity_continuity.py
#
# Persona OS 完全版における「Identity Continuity」の上位エンジン。
# 役割：
#   - MemoryOrchestrator の結果（MemorySelectionResult）を受け取る
#   - 旧 IdentityContinuityEngine（アンカー抽出）の hint を参照する（任意）
#   - 「今回の応答は、過去のどの文脈の“続き”なのか」をラベリングする
#   - PersonaController が LLM に渡す identity_context を組み立てる
#
# 本エンジンは：
#   ・判断しない
#   ・検索しない
#   ・人格を変えない
#
# あくまで
#   「話題の一貫性を“構造として示す”」
# ためのレイヤ。

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult

# legacy anchor engine は疎結合（型 Any）
LegacyAnchorEngine = Any


# ============================================================
# IdentityContinuityResult
# ============================================================

@dataclass
class IdentityContinuityResult:
    """
    PersonaController に返される Identity Continuity の結果。

    identity_context:
        LLM に渡される構造化コンテキスト。

    used_anchors:
        実際に使用されたアンカーラベル。

    notes:
        デバッグ・観測用メタ情報。
    """

    identity_context: Dict[str, Any] = field(default_factory=dict)
    used_anchors: List[str] = field(default_factory=list)
    notes: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# IdentityContinuityEngineV3
# ============================================================

class IdentityContinuityEngineV3:
    """
    Persona OS 完全版 Identity Continuity 上位エンジン。

    - legacy anchor engine を「判断材料」としてのみ参照
    - MemorySelectionResult と統合
    - 話題の“連続性”を構造化して返す
    """

    def __init__(
        self,
        *,
        anchor_engine: Optional[LegacyAnchorEngine] = None,
        max_memory_preview_chars: int = 240,
    ) -> None:
        self._anchor_engine = anchor_engine
        self._max_preview = int(max_memory_preview_chars)

    # ==========================================================
    # Public API
    # ==========================================================

    def build_identity_context(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
    ) -> IdentityContinuityResult:
        """
        PersonaController から呼ばれるメイン処理。
        """

        notes: Dict[str, Any] = {}

        # ------------------------------------------------------
        # 1) legacy anchor hint（任意）
        # ------------------------------------------------------
        anchor_hint = self._get_anchor_hint_safe(
            req=req,
            memory=memory,
            notes=notes,
        )

        # ------------------------------------------------------
        # 2) 過去文脈の有無
        # ------------------------------------------------------
        has_past_context = bool(memory.pointers)

        # ------------------------------------------------------
        # 3) memory preview（短縮）
        # ------------------------------------------------------
        memory_preview = self._build_memory_preview(memory)

        # ------------------------------------------------------
        # 4) topic label 推定
        # ------------------------------------------------------
        topic_label = self._infer_topic_label(
            req=req,
            anchor_hint=anchor_hint,
            has_past_context=has_past_context,
            memory_preview=memory_preview,
        )

        identity_context: Dict[str, Any] = {
            "topic_label": topic_label,
            "has_past_context": has_past_context,
            "anchor_hint": anchor_hint,
            "memory_preview": memory_preview,
        }

        used_anchors: List[str] = []
        if anchor_hint:
            used_anchors.append(anchor_hint)

        notes.update(
            {
                "memory_pointer_count": len(memory.pointers),
                "has_merged_summary": memory.merged_summary is not None,
                "request_preview": (req.message or "")[:80],
                "topic_label": topic_label,
            }
        )

        return IdentityContinuityResult(
            identity_context=identity_context,
            used_anchors=used_anchors,
            notes=notes,
        )

    # ==========================================================
    # Internal helpers
    # ==========================================================

    def _get_anchor_hint_safe(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        notes: Dict[str, Any],
    ) -> Optional[str]:
        """
        legacy anchor engine の get_hint を安全に呼び出す。

        許容シグネチャ：
          - get_hint()
          - get_hint(req)
          - get_hint(req=req, memory=memory)
        """
        if self._anchor_engine is None:
            notes["anchor_engine"] = "not_provided"
            return None

        try:
            fn = getattr(self._anchor_engine, "get_hint", None)
            if fn is None:
                notes["anchor_engine"] = "no_get_hint"
                return None

            sig = inspect.signature(fn)
            params = list(sig.parameters.values())

            # 引数なし
            if len(params) == 0:
                hint = fn()

            # 引数1つ（req）
            elif len(params) == 1:
                hint = fn(req)

            # それ以上 → keyword で渡す
            else:
                hint = fn(req=req, memory=memory)

            notes["anchor_engine"] = "ok"
            return hint

        except Exception as e:
            notes["anchor_engine"] = f"error:{type(e).__name__}"
            notes["anchor_engine_error"] = str(e)
            return None

    def _build_memory_preview(
        self,
        memory: MemorySelectionResult,
    ) -> Optional[str]:
        """
        merged_summary を identity_context 用に短縮。
        """
        if not memory.merged_summary:
            return None

        text = memory.merged_summary.strip()
        if len(text) <= self._max_preview:
            return text

        return text[: self._max_preview].rstrip() + "…"

    def _infer_topic_label(
        self,
        *,
        req: PersonaRequest,
        anchor_hint: Optional[str],
        has_past_context: bool,
        memory_preview: Optional[str],
    ) -> str:
        """
        topic_label 推定ロジック。

        優先順位：
          1) anchor_hint
          2) has_past_context
          3) 新規トピック
        """

        if anchor_hint:
            return anchor_hint

        if has_past_context:
            return "過去の会話の続き（自動推定）"

        text = (req.message or "").strip()
        if text:
            head = text.splitlines()[0].strip()
            if len(head) > 24:
                head = head[:24].rstrip() + "…"
            return f"新規トピック: {head}"

        return "新規トピック"