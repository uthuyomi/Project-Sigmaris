# sigmaris_persona_core/persona_modules/meta_reward_engine.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Dict, Any
import time

from ..types import Message, RewardSignal, TraitVector


@dataclass
class MetaRewardEngine:
    """
    MetaRewardEngine（メタ報酬エンジン / PersonaOS 完全版）

    役割:
      - 直近のメッセージ履歴から「深さ・安定性・ネガティビティ」などを評価
      - global_reward を -1.0〜1.0 で返す
      - 追加情報は meta に格納
    """

    # 評価対象とする時間窓（秒）
    window_sec: float = 5 * 60.0  # 直近5分

    # ローカル履歴
    history: List[Message] = field(default_factory=list)

    def feed(self, message: Message) -> None:
        now = time.time()
        self.history.append(message)

        # 古いものは削除
        trimmed: List[Message] = []
        for m in self.history:
            ts = getattr(m, "timestamp", None)
            if ts is None:
                trimmed.append(m)
                continue
            if (now - ts) <= self.window_sec:
                trimmed.append(m)
        self.history = trimmed

    # ------------------------------------------------------------

    def compute(self) -> RewardSignal:
        """
        RewardSignal(global_reward, trait_reward=None, reason, meta)
        の形式で返す。
        """
        # 0件ならニュートラル
        if not self.history:
            return RewardSignal(
                global_reward=0.0,
                trait_reward=None,
                reason="meta_reward:no_history",
                meta={
                    "depth": 0.0,
                    "openness": 0.0,
                    "stability": 0.0,
                    "negativity": 0.0,
                    "sample_size": 0,
                },
            )

        # user 発話のみ評価
        user_msgs = [
            m for m in self.history
            if getattr(m, "role", "") in ("user", "system_user")
        ]

        if not user_msgs:
            return RewardSignal(
                global_reward=0.0,
                trait_reward=None,
                reason="meta_reward:no_user_messages",
                meta={
                    "depth": 0.0,
                    "openness": 0.0,
                    "stability": 0.0,
                    "negativity": 0.0,
                    "sample_size": 0,
                },
            )

        # スコア計算
        depth = self._measure_depth(user_msgs)
        openness = self._measure_openness(user_msgs)
        stability = self._measure_stability(user_msgs)
        negativity = self._measure_negativity(user_msgs)

        # 合成
        raw = (
            + 0.4 * depth
            + 0.3 * openness
            + 0.3 * stability
            - 0.5 * negativity
        )
        global_reward = max(-1.0, min(1.0, raw))

        # reason タグ
        tags = []
        if depth > 0.6: tags.append("deep")
        if openness > 0.6: tags.append("open")
        if stability > 0.6: tags.append("stable")
        if negativity > 0.4: tags.append("negative")

        reason = "meta_reward"
        if tags:
            reason += ":" + ",".join(tags)

        return RewardSignal(
            global_reward=global_reward,
            trait_reward=None,  # v0.2 は trait_reward をまだ使わない
            reason=reason,
            meta={
                "depth": depth,
                "openness": openness,
                "stability": stability,
                "negativity": negativity,
                "sample_size": len(user_msgs),
            },
        )

    # ============================================================
    # 内部スコアリング
    # ============================================================

    def _measure_depth(self, messages: List[Message]) -> float:
        deep_keywords = [
            "なぜ", "なんで", "どうして", "意味", "理由", "本質",
            "方向", "変わった", "どう思う",
            "what does", "why", "meaning",
        ]
        if not messages:
            return 0.0
        hits = sum(
            1 for m in messages
            if any(k in (m.content or "").lower() for k in deep_keywords)
        )
        return max(0.0, min(1.0, hits / len(messages)))

    def _measure_openness(self, messages: List[Message]) -> float:
        keys = [
            "疲れ", "しんど", "つら", "悩", "不安", "正直", "本音",
            "私は", "俺は", "気持ち", "感情", "怖",
        ]
        if not messages:
            return 0.0
        hits = sum(
            1 for m in messages
            if any(k in (m.content or "").lower() for k in keys)
        )
        return max(0.0, min(1.0, hits / len(messages)))

    def _measure_stability(self, messages: List[Message]) -> float:
        extreme_pos = ["最高", "完璧", "神", "最強"]
        extreme_neg = ["最悪", "無理", "死にたい", "消えたい"]
        if not messages:
            return 0.5
        hits = sum(
            1 for m in messages
            if any(k in (m.content or "").lower() for k in extreme_pos)
            or any(k in (m.content or "").lower() for k in extreme_neg)
        )
        ratio = hits / len(messages)
        return max(0.0, min(1.0, 1.0 - ratio))

    def _measure_negativity(self, messages: List[Message]) -> float:
        neg = [
            "無理", "だめ", "嫌", "いや", "疲れた", "しんどい",
            "つらい", "終わり", "価値がない", "どうでもいい",
        ]
        if not messages:
            return 0.0
        hits = sum(
            1 for m in messages
            if any(k in (m.content or "").lower() for k in neg)
        )
        return max(0.0, min(1.0, hits / len(messages)))