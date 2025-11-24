# sigmaris_persona_core/persona_modules/value_drift_engine.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Any

from ..types import TraitVector, RewardSignal
from ..config import ValueDriftConfig


@dataclass
class ValueDriftEngine:
    """
    自律的価値変動（Value Drift）エンジン v0.2

    役割:
      - 現在の TraitVector（calm/empathy/curiosity）と RewardSignal から
        「わずかな長期ドリフト」を加える。
      - 長期的には 0.5 付近に収束させつつ、
        報酬に応じた微細なズレを蓄積させる。

    仕様:
      - config.max_step / min_step で 1 ステップの最大/最小変動幅を制限
      - config.decay で中心値 0.5 に対する引き戻しを行う（0.0〜1.0）
      - RewardSignal は
          global_reward: float  （全体評価）
          trait_reward: TraitVector 相当（各軸への評価）
        を持つことを想定。
        dict 形式が来ても動くように防御的に実装している。
    """

    config: ValueDriftConfig

    # ------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------
    def step(
        self,
        traits: TraitVector,
        reward: RewardSignal | dict[str, Any],
    ) -> TraitVector:
        """
        1 ステップ分の Value Drift を適用した TraitVector を返す。

        - traits: 現在のトレイト値（0.0〜1.0 を想定）
        - reward: MetaRewardEngine 等からの RewardSignal または dict
        """
        # 現在値を float にクリップ
        calm = float(traits.calm)
        empathy = float(traits.empathy)
        curiosity = float(traits.curiosity)

        # 中心 0.5 からの偏差を減衰させる（value_decay）
        calm = self._decay_toward_center(calm)
        empathy = self._decay_toward_center(empathy)
        curiosity = self._decay_toward_center(curiosity)

        # 報酬に基づくドリフト量
        global_r = self._get_global_reward(reward)
        trait_r = self._get_trait_reward(reward)

        step_size = self._compute_step_size(global_r)

        # 各軸に対して微小な変動を加える
        calm += self._drift_for_axis(
            axis_value=calm,
            axis_name="calm",
            global_reward=global_r,
            trait_reward=trait_r,
            step_size=step_size,
        )
        empathy += self._drift_for_axis(
            axis_value=empathy,
            axis_name="empathy",
            global_reward=global_r,
            trait_reward=trait_r,
            step_size=step_size,
        )
        curiosity += self._drift_for_axis(
            axis_value=curiosity,
            axis_name="curiosity",
            global_reward=global_r,
            trait_reward=trait_r,
            step_size=step_size,
        )

        # 最終的に 0.0〜1.0 にクリップ
        calm = self._clip01(calm)
        empathy = self._clip01(empathy)
        curiosity = self._clip01(curiosity)

        return TraitVector(calm=calm, empathy=empathy, curiosity=curiosity)

    # ------------------------------------------------------------
    # 内部ユーティリティ
    # ------------------------------------------------------------
    def _decay_toward_center(self, v: float) -> float:
        """
        中心 0.5 に向かって少しだけ引き戻す。

        v' = 0.5 + (v - 0.5) * decay
        """
        center = 0.5
        return center + (v - center) * float(self.config.decay)

    def _get_global_reward(
        self,
        reward: RewardSignal | dict[str, Any],
    ) -> float:
        """
        RewardSignal / dict のどちらでも global_reward を取り出す。
        見つからなければ 0.0。
        """
        # dataclass / オブジェクト形式
        if hasattr(reward, "global_reward"):
            try:
                return float(getattr(reward, "global_reward"))
            except Exception:
                pass

        # dict 形式
        if isinstance(reward, dict) and "global_reward" in reward:
            try:
                return float(reward.get("global_reward", 0.0))
            except Exception:
                pass

        return 0.0

    def _get_trait_reward(
        self,
        reward: RewardSignal | dict[str, Any],
    ) -> dict[str, float]:
        """
        RewardSignal / dict から trait_reward 相当を取り出して
        {"calm": ..., "empathy": ..., "curiosity": ...} の dict に正規化する。
        見つからない場合は 0.0 にする。
        """
        # オブジェクト型: reward.trait_reward.calm など
        if hasattr(reward, "trait_reward"):
            tr = getattr(reward, "trait_reward", None)
            if tr is not None:
                vals: dict[str, float] = {}
                for k in ("calm", "empathy", "curiosity"):
                    try:
                        vals[k] = float(getattr(tr, k, 0.0))
                    except Exception:
                        vals[k] = 0.0
                return vals

        # dict 型: reward["trait_reward"] が dict のケース
        if isinstance(reward, dict):
            tr = reward.get("trait_reward") or {}
            if isinstance(tr, dict):
                vals = {}
                for k in ("calm", "empathy", "curiosity"):
                    try:
                        vals[k] = float(tr.get(k, 0.0))
                    except Exception:
                        vals[k] = 0.0
                return vals

        # 何も取れなかった場合
        return {"calm": 0.0, "empathy": 0.0, "curiosity": 0.0}

    def _compute_step_size(self, global_reward: float) -> float:
        """
        global_reward の絶対値に応じて
        min_step〜max_step の間でステップ幅を決める。

        - |global_reward| が小さい → min_step 付近
        - |global_reward| が大きい → max_step 付近
        """
        mag = abs(global_reward)
        if mag > 1.0:
            mag = 1.0

        min_s = float(self.config.min_step)
        max_s = float(self.config.max_step)

        return min_s + (max_s - min_s) * mag

    def _drift_for_axis(
        self,
        *,
        axis_value: float,
        axis_name: str,
        global_reward: float,
        trait_reward: dict[str, float],
        step_size: float,
    ) -> float:
        """
        個別軸（calm/empathy/curiosity）に対する変動量を計算。

        - global_reward は全軸に薄く効く
        - trait_reward[axis_name] があれば、その軸にやや強めに効く
        """
        # global_reward による共通ドリフト
        drift = step_size * float(global_reward) * 0.3

        # 各軸固有の評価
        axis_r = float(trait_reward.get(axis_name, 0.0))

        # 軸固有の評価は少し強めに反映
        drift += step_size * axis_r * 0.7

        # axis_value そのものはここでは参照しないが、
        # 将来的に「高すぎる時は抑制」などのロジックを入れる余地として残しておく
        _ = axis_value

        return drift

    @staticmethod
    def _clip01(v: float) -> float:
        """0.0〜1.0 にクリップ。"""
        if v < 0.0:
            return 0.0
        if v > 1.0:
            return 1.0
        return v