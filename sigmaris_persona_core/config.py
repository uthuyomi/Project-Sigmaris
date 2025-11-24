# sigmaris_persona_core/config.py
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class SilenceConfig:
    """主体的沈黙のしきい値など。"""
    max_abstraction: float = 0.8
    max_loop_suspect: float = 0.7
    allow_when_user_insists: bool = True


@dataclass
class ValueDriftConfig:
    """自律的価値変動（Value Drift）の設定。"""
    max_step: float = 0.02
    min_step: float = 0.001
    # 長期的に 0.5 付近に戻るイメージ（Value Drift 減衰）
    decay: float = 0.995


@dataclass
class IntuitionConfig:
    """疑似直観のトリガー条件。"""
    # どれくらいコンテキストが溜まったら「直観」を有効にするか
    min_context_size: int = 5
    # 直近どれくらいの時間スパンを見て「流れ」を読むか
    min_time_span_sec: float = 60.0
    # 0〜1 で「どれくらい強く結論を押すか」
    strength: float = 0.4


@dataclass
class MemoryConfig:
    """記憶ストラタのしきい値。"""
    short_window_sec: float = 15 * 60   # 15分
    mid_window_sec: float = 48 * 3600   # 2日
    long_min_count: int = 5             # 同種トピックが 5 回以上で long-term 候補


@dataclass
class StateMachineConfig:
    """
    PersonaOS 内部ステートマシンの挙動。
    ※ state_machine.py のフィールド名と厳密に合わせてある。
    """
    overload_limit_per_min: int = 20
    # state_machine.py 側で reflect_cooldown_sec / introspect_cooldown_sec を参照
    reflect_cooldown_sec: float = 30.0
    introspect_cooldown_sec: float = 60.0


@dataclass
class EmotionConfig:
    """感情レイヤの設定。"""
    base_temperature: float = 0.6
    min_temperature: float = 0.3
    max_temperature: float = 0.9

    def clamp(self, t: float) -> float:
        """
        温度を [min_temperature, max_temperature] にクリップするユーティリティ。
        EmotionCore 側から任意に利用可能。
        """
        if t < self.min_temperature:
            return self.min_temperature
        if t > self.max_temperature:
            return self.max_temperature
        return t


# -----------------------------
# 🔥 PersonaOS 全体設定（Python 3.13 / strict 対応）
# -----------------------------
@dataclass
class PersonaOSConfig:
    """PersonaOS 全体の設定束ね。"""
    silence: SilenceConfig = field(default_factory=SilenceConfig)
    value_drift: ValueDriftConfig = field(default_factory=ValueDriftConfig)
    intuition: IntuitionConfig = field(default_factory=IntuitionConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    state: StateMachineConfig = field(default_factory=StateMachineConfig)
    emotion: EmotionConfig = field(default_factory=EmotionConfig)