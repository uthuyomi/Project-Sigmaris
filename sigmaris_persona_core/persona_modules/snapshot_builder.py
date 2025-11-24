# sigmaris_persona_core/persona_modules/snapshot_builder.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any

from ..types import TraitVector
from ..config import EmotionConfig


@dataclass
class SnapshotBuilder:
    """
    PersonaOS の内部状態を "1 スナップショット構造" としてまとめるモジュール。

    PersonaOS.process() からは：
        snapshot = self.snapshot_builder.build(
            state=state,
            traits=self.traits,
            flags=flags,
            reward=reward,
        )

    返す snapshot は UI / デバッグ / 内部ロギングで使うことを想定。
    """

    # 将来的に EmotionConfig や他モジュールも参照できるように placeholder
    emotion_config: EmotionConfig | None = None

    # ============================================================
    # PUBLIC API
    # ============================================================
    def build(
        self,
        *,
        state: str,
        traits: TraitVector,
        flags: Dict[str, bool],
        reward: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Persona の状態をまとめたスナップショットを返す。
        """
        return {
            "state": state,
            "traits": self._traits_block(traits),
            "flags": flags,
            "reward": self._reward_block(reward),
            "meta": {
                "version": "persona_snapshot_v0.2",
            },
        }

    # ============================================================
    # INTERNAL HELPERS
    # ============================================================

    def _traits_block(self, traits: TraitVector) -> Dict[str, float]:
        """
        TraitVector → dict に変換（0.0〜1.0）。
        """
        try:
            return {
                "calm": float(traits.calm),
                "empathy": float(traits.empathy),
                "curiosity": float(traits.curiosity),
            }
        except Exception:
            # 想定外形式にも防御的に対応
            return {
                "calm": float(getattr(traits, "calm", 0.5)),
                "empathy": float(getattr(traits, "empathy", 0.5)),
                "curiosity": float(getattr(traits, "curiosity", 0.5)),
            }

    def _reward_block(self, reward: Dict[str, Any]) -> Dict[str, Any]:
        """
        RewardSignal / dict に統一対応させた軽量抽出。
        """
        # global_reward
        if hasattr(reward, "global_reward"):
            try:
                global_r = float(getattr(reward, "global_reward"))
            except Exception:
                global_r = 0.0
        else:
            global_r = float(reward.get("global_reward", 0.0))

        # trait_reward
        trait_r_raw = None
        if hasattr(reward, "trait_reward"):
            trait_r_raw = getattr(reward, "trait_reward", None)
        else:
            trait_r_raw = reward.get("trait_reward")

        trait_reward = {}
        for k in ("calm", "empathy", "curiosity"):
            try:
                if isinstance(trait_r_raw, dict):
                    trait_reward[k] = float(trait_r_raw.get(k, 0.0))
                else:
                    trait_reward[k] = float(getattr(trait_r_raw, k, 0.0))
            except Exception:
                trait_reward[k] = 0.0

        return {
            "global_reward": global_r,
            "trait_reward": trait_reward,
        }