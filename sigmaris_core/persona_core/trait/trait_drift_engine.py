# sigmaris-core/persona_core/trait/trait_drift_engine.py
# -------------------------------------------------------------
# Persona OS 完全版 Trait Drift Engine
#
# calm / empathy / curiosity の 3軸 TraitState を、
# Identity / Memory / Value / Affect から微小更新する。
#
# ValueDriftEngine と構造を完全同期し、
# PersonaDB の snapshot 機能にも対応した完全版。
# -------------------------------------------------------------

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Any, Optional

from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.value.value_drift_engine import ValueState


# ======================================================
# Trait State
# ======================================================

@dataclass
class TraitState:
    """
    calm      : 落ち着き。高いほど反応が穏やかで衝突しにくい
    empathy   : 共感性。高いほど相手の心情を汲む傾向が強い
    curiosity : 探索性。新しい話題・深掘りへの姿勢
    """

    calm: float = 0.0
    empathy: float = 0.0
    curiosity: float = 0.0

    def to_dict(self) -> Dict[str, float]:
        return {
            "calm": self.calm,
            "empathy": self.empathy,
            "curiosity": self.curiosity,
        }


# ======================================================
# Drift Result
# ======================================================

@dataclass
class TraitDriftResult:
    new_state: TraitState
    delta: Dict[str, float] = field(default_factory=dict)
    notes: Dict[str, Any] = field(default_factory=dict)


# ======================================================
# Trait Drift Engine（完全版）
# ======================================================

class TraitDriftEngine:
    """
    Persona OS 完全版 Trait Drift Engine

    - Value Drift よりさらに遅い変化速度
    - 1ターンの変動は極めて小さく、長期会話でのみ偏りが形成
    - ValueState（openness / safety_bias）と強調連動
    - Affect（緊張／暖かさ／興味）の直接影響も扱う
    """

    def __init__(
        self,
        *,
        learning_rate: float = 0.01,
        max_abs_value: float = 1.0,
        decay_rate: float = 0.0005,
    ) -> None:
        self._lr = float(learning_rate)
        self._limit = float(max_abs_value)
        self._decay = float(decay_rate)

    # ======================================================
    # Public API
    # ======================================================

    def apply(
        self,
        *,
        current: TraitState,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        affect_signal: Optional[Dict[str, float]] = None,
        db: Optional[Any] = None,
        user_id: Optional[str] = None,
    ) -> TraitDriftResult:

        # deep copy（破壊防止）
        new_state = TraitState(
            calm=current.calm,
            empathy=current.empathy,
            curiosity=current.curiosity,
        )

        deltas: Dict[str, float] = {k: 0.0 for k in new_state.to_dict().keys()}

        # ---- 1) 自然減衰（中央 0.0 に戻す）----
        self._apply_decay(new_state, deltas)

        # ---- 2) Identity influence ----
        self._apply_identity_influence(new_state, deltas, identity)

        # ---- 3) Memory influence ----
        self._apply_memory_influence(new_state, deltas, memory)

        # ---- 4) Value influence ----
        self._apply_value_influence(new_state, deltas, value_state)

        # ---- 5) Affect (tension / warmth / curiosity 信号) ----
        self._apply_affect_influence(new_state, deltas, affect_signal)

        # ---- 6) clip ----
        self._clip_state(new_state)

        # ---- 7) DB Snapshot ----
        self._store_snapshot_if_supported(
            db=db,
            user_id=user_id,
            state=new_state,
            deltas=deltas,
            req=req,
            memory=memory,
            identity=identity,
        )

        notes = {
            "value_state": value_state.to_dict(),
            "affect_signal": affect_signal,
            "memory_pointer_count": len(memory.pointers),
            "identity_topic_label": identity.identity_context.get("topic_label"),
        }

        return TraitDriftResult(new_state=new_state, delta=deltas, notes=notes)

    # ======================================================
    # Influence functions（内部ロジック）
    # ======================================================

    def _apply_decay(self, state: TraitState, deltas: Dict[str, float]) -> None:
        """Trait が 0 に戻る微小減衰。"""
        for k in deltas.keys():
            v = getattr(state, k)
            dv = -v * self._decay
            setattr(state, k, v + dv)
            deltas[k] += dv

    # ------------------------------------------------------

    def _apply_identity_influence(
        self,
        state: TraitState,
        deltas: Dict[str, float],
        identity: IdentityContinuityResult,
    ) -> None:
        ctx = identity.identity_context or {}
        has_past = bool(ctx.get("has_past_context"))
        topic = (ctx.get("topic_label") or "").lower()
        base = self._lr

        # 過去文脈が続く → calm↑
        if has_past:
            dv = base * 0.3
            state.calm += dv
            deltas["calm"] += dv

        # ネガティブテーマ → calm↓
        negative_terms = ["衝突", "トラブル", "喧嘩", "conflict", "fight", "problem"]
        if any(term in topic for term in negative_terms):
            dv = -base * 0.4
            state.calm += dv
            deltas["calm"] += dv

    # ------------------------------------------------------

    def _apply_memory_influence(
        self,
        state: TraitState,
        deltas: Dict[str, float],
        memory: MemorySelectionResult,
    ) -> None:
        count = len(memory.pointers)
        base = self._lr

        # 記憶 pointer が多い → empathy↑（文脈理解強化）
        if count >= 3:
            dv = base * 0.4
            state.empathy += dv
            deltas["empathy"] += dv
        elif 1 <= count <= 2:
            dv = base * 0.2
            state.empathy += dv
            deltas["empathy"] += dv

    # ------------------------------------------------------

    def _apply_value_influence(
        self,
        state: TraitState,
        deltas: Dict[str, float],
        value_state: ValueState,
    ) -> None:
        base = self._lr

        # openness → curiosity↑
        if value_state.openness > 0:
            dv = base * 0.5 * value_state.openness
            state.curiosity += dv
            deltas["curiosity"] += dv

        # safety_bias → calm↑ かつ curiosity↓（慎重寄り）
        if value_state.safety_bias > 0:
            dc = base * 0.4 * value_state.safety_bias
            dcu = -base * 0.3 * value_state.safety_bias

            state.calm += dc
            state.curiosity += dcu

            deltas["calm"] += dc
            deltas["curiosity"] += dcu

    # ------------------------------------------------------

    def _apply_affect_influence(
        self,
        state: TraitState,
        deltas: Dict[str, float],
        affect_signal: Optional[Dict[str, float]],
    ) -> None:
        if not affect_signal:
            return

        base = self._lr

        tension = float(affect_signal.get("tension", 0.0) or 0.0)
        warmth = float(affect_signal.get("warmth", 0.0) or 0.0)
        curious = float(affect_signal.get("curiosity", 0.0) or 0.0)

        # tension → calm↓
        if tension != 0.0:
            dv = -base * 0.5 * tension
            state.calm += dv
            deltas["calm"] += dv

        # warmth → empathy↑
        if warmth != 0.0:
            dv = base * 0.6 * warmth
            state.empathy += dv
            deltas["empathy"] += dv

        # curiosity signal → curiosity↑
        if curious != 0.0:
            dv = base * 0.7 * curious
            state.curiosity += dv
            deltas["curiosity"] += dv

    # ------------------------------------------------------

    def _clip_state(self, state: TraitState) -> None:
        """Trait を [-limit, +limit] に収める"""
        for k, v in state.to_dict().items():
            if v > self._limit:
                setattr(state, k, self._limit)
            elif v < -self._limit:
                setattr(state, k, -self._limit)

    # ------------------------------------------------------

    def _store_snapshot_if_supported(
        self,
        *,
        db: Any,
        user_id: Optional[str],
        state: TraitState,
        deltas: Dict[str, float],
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
    ) -> None:
        """
        PersonaDB が store_trait_snapshot を実装している場合のみ保存。
        """
        if db is None or not hasattr(db, "store_trait_snapshot"):
            return

        meta = {
            "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id"),
            "request_preview": (req.message or "")[:80],
            "memory_pointer_count": len(memory.pointers),
            "identity_topic_label": identity.identity_context.get("topic_label"),
        }

        payload = {
            "user_id": user_id,
            "state": state.to_dict(),
            "delta": deltas,
            "meta": meta,
        }

        try:
            db.store_trait_snapshot(**payload)
        except Exception:
            # OS 全体の動作に影響させない
            pass
