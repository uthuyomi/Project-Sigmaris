# sigmaris_persona_core/persona_modules/intuition_engine.py
from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict, Any
import time

from ..types import Message
from ..config import IntuitionConfig


@dataclass
class IntuitionEngine:
    """
    疑似直観（Pseudo-Intuition）を判定するエンジン。

    PersonaOS では：
        intuition_info = self.intuition.infer(self.messages)

    返却形式：
        {
          "allow": bool,
          "reason": str
        }

    v0.2 仕様のポイント：
      - コンテキスト量が十分であること
      - 一定以上の時間スパンで会話が続いていること
      - 内容が「深層系問い」に該当すること
    """

    config: IntuitionConfig

    # ------------------------------------------------------------
    # Main
    # ------------------------------------------------------------
    def infer(self, messages: List[Message]) -> Dict[str, Any]:
        """
        メッセージ履歴から疑似直観を発火させるか判定する。
        PersonaOS の "need_reflection" / "need_introspection" の根拠になる。
        """
        # --------------------------------------------------------
        # 0. メッセージが存在しない
        # --------------------------------------------------------
        if not messages:
            return {"allow": False, "reason": "no_messages"}

        # --------------------------------------------------------
        # 1. コンテキスト量チェック
        # --------------------------------------------------------
        total = len(messages)
        if total < self.config.min_context_size:
            return {
                "allow": False,
                "reason": f"context_too_small:{total}",
            }

        # --------------------------------------------------------
        # 2. 時間的スパンチェック
        # --------------------------------------------------------
        timestamps: List[float] = []

        for m in messages:
            try:
                timestamps.append(float(m.timestamp))
            except Exception:
                pass

        if len(timestamps) < 2:
            return {
                "allow": False,
                "reason": "insufficient_timestamp",
            }

        t_min = min(timestamps)
        t_max = max(timestamps)
        span = max(0.0, t_max - t_min)

        if span < self.config.min_time_span_sec:
            return {
                "allow": False,
                "reason": f"timespan_short:{span:.2f}",
            }

        # --------------------------------------------------------
        # 3. 内容ベースの深層パターンチェック
        # --------------------------------------------------------
        # latest message に深層質問・自己探求系が含まれるか？
        last = (messages[-1].content or "").lower()

        # LLM/人間ハイブリッド環境向けに和英両方をケア
        deep_keywords = [
            # Japanese question patterns
            "どう思う", "なんで", "理由", "意味", "方向", "変わった", "今の私",
            "本質", "深い", "正直", "内面",
            # English patterns
            "why", "meaning", "reason", "direction", "inner", "core"
        ]

        deep_hit = any(k in last for k in deep_keywords)

        if not deep_hit:
            return {
                "allow": False,
                "reason": "no_deep_pattern",
            }

        # --------------------------------------------------------
        # 4. 疑似直観発火
        # --------------------------------------------------------
        return {
            "allow": True,
            "reason": "intuition_triggered",
        }