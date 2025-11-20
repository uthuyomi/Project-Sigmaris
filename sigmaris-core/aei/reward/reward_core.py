# aei/reward/reward_core.py
from __future__ import annotations

from typing import Dict, Any
from dataclasses import dataclass, asdict


@dataclass
class RewardState:
    """
    Internal Reward State for AEI
    -----------------------------
    AEI が “好ましい行動 / 望ましくない行動” を学習するための内部価値。
    - positive: 安心・安定を高める行為
    - negative: 過負荷・依存・不安を生む行為
    - neutral: どちらでもない通常時の基準値

    ここでは「簡易的な価値空間」だが、
    後にロボット用意図決定に統合しても破綻しない。
    """

    positive: float = 0.0
    negative: float = 0.0
    neutral: float = 0.0

    def as_dict(self) -> Dict[str, float]:
        return asdict(self)


class RewardCore:
    """
    Sigmaris OS — Internal Reward System (内部報酬モデル)
    ---------------------------------------------------

    AEI の安定性に最も重要な層のひとつ。
    - 良い行動 → baseline を健全に成長させる
    - 悪い行動 → baseline を抑制し、安定性を優先する
    - neutral → 変化なし

    ロボ化を前提にした “安全な強化学習の骨格だけ” を持ち、
    危険な自律性は完全に排除している。
    """

    def __init__(self):
        self.state = RewardState()

        # 一回の学習で baseline に反映できる最大変化
        self.max_effect = 0.03  # 3% のみ動かす（安全）

    # ====================================================================
    # 与えられる reward
    # ====================================================================

    def give_positive(self, value: float = 1.0) -> None:
        """
        AEI にとって安心・安定・距離感が適切な行為。
        """
        self.state.positive += float(value)

    def give_negative(self, value: float = 1.0) -> None:
        """
        過負荷・侵入的・依存的・疲労の兆候を生む行為。
        """
        self.state.negative += float(value)

    def give_neutral(self, value: float = 1.0) -> None:
        """
        特に良くも悪くもない通常の応答。
        """
        self.state.neutral += float(value)

    # ====================================================================
    # baseline への作用（Identity との連携）
    # ====================================================================

    def compute_effect(self) -> Dict[str, float]:
        """
        現在の reward 状態から IdentityCore に渡す “微小調整量” を返す。

        これは Sigmaris の人格を自己安定化させる中核。
        """

        total = self.state.positive + self.state.negative + self.state.neutral
        if total == 0:
            return {"calm": 0.0, "empathy": 0.0, "curiosity": 0.0}

        # 正規化
        p = self.state.positive / total
        n = self.state.negative / total

        # 長期安定性に基づいた重みづけ（人間の経験則に似せてある）
        calm_adj = (p * 0.6 - n * 0.7) * self.max_effect
        empathy_adj = (p * 0.3 - n * 0.2) * self.max_effect
        curiosity_adj = (p * 0.2 - n * 0.4) * self.max_effect

        return {
            "calm": round(calm_adj, 6),
            "empathy": round(empathy_adj, 6),
            "curiosity": round(curiosity_adj, 6),
        }

    # ====================================================================
    # 後処理
    # ====================================================================

    def reset(self) -> None:
        """
        1 回の心理サイクルごとに reward をクリアし、
        AEI が “新しい一日” を始められるようにする。
        """
        self.state = RewardState()

    # ====================================================================
    # 可視化 / デバッグ
    # ====================================================================

    def summary(self) -> Dict[str, Any]:
        """
        現状の報酬値と baseline への推定効果の要約。
        """
        effect = self.compute_effect()
        return {
            "reward_state": self.state.as_dict(),
            "effect": effect,
        }