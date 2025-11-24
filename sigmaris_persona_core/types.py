# sigmaris_persona_core/types.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Any
import time

# ============================================================
# 基本ロール
# ============================================================

Role = Literal["user", "assistant", "system", "meta"]


@dataclass
class Message:
    """
    PersonaOS / AEI コア間でやり取りするメッセージの最小単位。
    """
    role: Role
    content: str
    timestamp: float = field(default_factory=lambda: time.time())
    tags: List[str] = field(default_factory=list)


# ============================================================
# トレイト / コンテキスト
# ============================================================

@dataclass
class TraitVector:
    """
    人格の基本3軸（0.0〜1.0）。
    """
    calm: float
    empathy: float
    curiosity: float


@dataclass
class PersonaContext:
    """
    PersonaOS に渡される外部メタ情報。
    """
    user_id: str
    session_id: str
    locale: str = "ja-JP"
    client: str = "sigmaris-os"
    extra: Dict[str, Any] = field(default_factory=dict)


# ============================================================
# Memory / Reward
# ============================================================

@dataclass
class MemoryEntry:
    """
    PersonaOS 内部で扱うメモリエントリ。
    """
    ts: float
    kind: Literal["short", "mid", "long"]
    content: str
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RewardSignal:
    """
    PersonaOS 完全版のメタ報酬信号。

    MetaRewardEngine / ValueDriftEngine / PersonaOS 全体で共通利用する形。

    - global_reward: float — 報酬スカラー（-1.0〜+1.0 を想定）
    - trait_reward: Optional[TraitVector] — 軸ごとの報酬（使わなければ None）
    - reason: str — なぜこの報酬が発生したか（タグ）
    - meta: dict — AEI 側の生データや補足情報
    - detail: dict — ヒューリスティック内訳など UI 可視化用
    """
    global_reward: float
    trait_reward: Optional[TraitVector] = None
    reason: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)
    detail: Dict[str, Any] = field(default_factory=dict)

    # 互換用プロパティ（古い「value」参照を吸収）
    @property
    def value(self) -> float:
        return self.global_reward

    @value.setter
    def value(self, v: float) -> None:
        self.global_reward = v


# ============================================================
# Snapshot / Decision
# ============================================================

@dataclass
class PersonaStateSnapshot:
    """
    PersonaOS 内部状態のスナップショット。
    """
    state: str
    traits: TraitVector
    flags: Dict[str, bool]
    last_reward: Optional[RewardSignal] = None


@dataclass
class PersonaDecision:
    """
    PersonaOS が返す応答方針（UI / システム向け）。
    """
    allow_reply: bool
    preferred_state: str
    tone: str               # EmotionCore は str ラベルを返すため Literal ではない
    temperature: float
    top_p: float

    need_reflection: bool
    need_introspection: bool

    apply_contradiction_note: bool
    apply_identity_anchor: bool

    updated_traits: TraitVector
    reward: Optional[RewardSignal] = None

    debug: Dict[str, Any] = field(default_factory=dict)