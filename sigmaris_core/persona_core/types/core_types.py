# sigmaris-core/persona_core/types/core_types.py
# ============================================================
# Persona Core 共通型定義
#  - 完全版 Persona OS
#  - 旧 PersonaOS 互換レイヤ
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Dict, List, Optional, Literal, Union


# ============================================================
# Persona Global State（旧 PersonaOS 用・レガシーレイヤ）
# ============================================================

class PersonaState(Enum):
    IDLE = auto()
    FOCUSED = auto()
    DEEP_REFLECTION = auto()
    SAFETY_OVERRIDDEN = auto()
    OVERLOADED = auto()


# ============================================================
# Memory Pointer（完全版 Persona OS 共通型）
# ============================================================

@dataclass
class MemoryPointer:
    """
    Orchestrator / EpisodeMerger / IdentityContinuity / FSM が共有する
    「どのエピソードを参照したか」のトレース情報。
    """
    episode_id: str
    source: str          # "episodic", "long_term", "scratch" など
    score: float
    summary: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        """DB / JSON 保存用（__dict__ 直接使用の代替）"""
        return {
            "episode_id": self.episode_id,
            "source": self.source,
            "score": self.score,
            "summary": self.summary,
        }


# ============================================================
# Memory Entry（完全版 OS 用・補助構造）
# ============================================================

@dataclass
class MemoryEntry:
    ts: float
    kind: Literal["short", "mid", "long"]
    content: str
    meta: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Trait Vector（完全版仕様）
# ============================================================

@dataclass
class TraitVector:
    calm: float = 0.0
    empathy: float = 0.0
    curiosity: float = 0.0

    def as_dict(self) -> Dict[str, float]:
        return {
            "calm": self.calm,
            "empathy": self.empathy,
            "curiosity": self.curiosity,
        }


# ============================================================
# Reward Signal（完全版仕様）
# ============================================================

@dataclass(init=False)
class RewardSignal:
    value: float
    trait_reward: Optional[Union[Dict[str, float], TraitVector]] = None
    reason: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)
    detail: Dict[str, Any] = field(default_factory=dict)

    def __init__(
        self,
        value: Optional[float] = None,
        *,
        global_reward: Optional[float] = None,
        trait_reward: Optional[Union[Dict[str, float], TraitVector]] = None,
        reason: str = "",
        meta: Optional[Dict[str, Any]] = None,
        detail: Optional[Dict[str, Any]] = None,
    ) -> None:
        if value is None and global_reward is None:
            v = 0.0
        elif value is not None:
            v = float(value)
        else:
            v = float(global_reward)

        object.__setattr__(self, "value", v)
        object.__setattr__(self, "trait_reward", trait_reward)
        object.__setattr__(self, "reason", reason)
        object.__setattr__(self, "meta", meta or {})
        object.__setattr__(self, "detail", detail or {})

    @property
    def global_reward(self) -> float:
        return self.value

    @global_reward.setter
    def global_reward(self, v: float) -> None:
        object.__setattr__(self, "value", float(v))


# ============================================================
# Identity / State Trace（旧 PersonaOS 補助）
# ============================================================

@dataclass
class IdentityHint:
    tags: List[str] = field(default_factory=list)
    confidence: float = 0.0
    note: Optional[str] = None


@dataclass
class StateTransitionTrace:
    previous_state: PersonaState
    next_state: PersonaState
    reason: str
    conditions: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Drift Snapshot（完全版）
# ============================================================

@dataclass
class DriftSnapshot:
    value_baseline: Dict[str, float] = field(default_factory=dict)
    trait_vector: TraitVector = field(default_factory=TraitVector)
    meta_reward_signal: Optional[float] = None


# ============================================================
# Persona Request（完全版入口）
# ============================================================

@dataclass(init=False)
class PersonaRequest:
    user_id: str
    session_id: str
    message: str
    locale: str = "ja-JP"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __init__(
        self,
        user_id: str,
        session_id: str,
        message: str,
        locale: str = "ja-JP",
        *,
        metadata: Optional[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        object.__setattr__(self, "user_id", user_id)
        object.__setattr__(self, "session_id", session_id)
        object.__setattr__(self, "message", message)
        object.__setattr__(self, "locale", locale)

        base: Dict[str, Any] = {}
        if metadata:
            base.update(metadata)
        if context:
            base.update(context)

        object.__setattr__(self, "metadata", base)

    @property
    def context(self) -> Dict[str, Any]:
        return self.metadata


# ============================================================
# Persona Decision（旧 PersonaOS / UI 用）
# ============================================================

@dataclass
class PersonaDecision:
    allow_reply: bool
    preferred_state: str
    tone: str
    temperature: float
    top_p: float

    need_reflection: bool
    need_introspection: bool

    apply_contradiction_note: bool
    apply_identity_anchor: bool

    updated_traits: TraitVector
    reward: Optional[RewardSignal] = None

    # ★ 完全版互換拡張（Optional）
    memory_raw: Optional[Dict[str, Any]] = None
    memory_search: Optional[Dict[str, Any]] = None

    debug: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Persona Debug Info（旧 PersonaOS 用）
# ============================================================

@dataclass
class PersonaDebugInfo:
    memory_pointers: List[MemoryPointer] = field(default_factory=list)
    identity_hint: Optional[IdentityHint] = None
    state_trace: Optional[StateTransitionTrace] = None
    drift_snapshot: Optional[DriftSnapshot] = None
    raw_reasoning_notes: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Persona Response（旧 PersonaOS → 外部）
# ============================================================

@dataclass
class PersonaResponse:
    reply: str
    state: PersonaState = PersonaState.IDLE
    debug: Optional[PersonaDebugInfo] = None