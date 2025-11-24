# sigmaris_persona_core/persona_modules/silence_manager.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any

from ..config import SilenceConfig


@dataclass
class SilenceManager:
    """
    主体的沈黙（あえて返答しない）を決めるモジュール。

    PersonaOS.process() では次の形式で使用される：
        silence_info = silence.decide(
            abstraction_score=...,
            loop_suspect_score=...,
            user_insists=...
        )

    返却形式：
        {
          "silence": bool,
          "reason": str
        }
    """

    config: SilenceConfig

    # ------------------------------------------------------------
    # Main Logic
    # ------------------------------------------------------------
    def decide(
        self,
        *,
        abstraction_score: float,
        loop_suspect_score: float,
        user_insists: bool,
    ) -> Dict[str, Any]:
        """
        主体的沈黙を行うかどうか判定する。

        方針：
        - 抽象度が高い or ループ気味 → 「沈黙候補」
        - ただし user が強く回答を求める場合、
            allow_when_user_insists=True なら沈黙しない
        """

        # 安全クリップ
        a = max(0.0, min(1.0, abstraction_score))
        l = max(0.0, min(1.0, loop_suspect_score))

        # 閾値判定
        too_abstract = a >= self.config.max_abstraction
        too_loopy = l >= self.config.max_loop_suspect

        silence_candidate = (too_abstract or too_loopy)

        # ------------------------------------------------------------
        # Case 1：ユーザーが強く要求している場合
        # ------------------------------------------------------------
        if user_insists and self.config.allow_when_user_insists:
            # 本来沈黙候補でも“軽めの返答”を許可
            return {
                "silence": False,
                "reason": self._build_reason(
                    silence=False,
                    too_abstract=too_abstract,
                    too_loopy=too_loopy,
                    user_insists=True,
                ),
            }

        # ------------------------------------------------------------
        # Case 2：通常沈黙パターン
        # ------------------------------------------------------------
        if silence_candidate:
            return {
                "silence": True,
                "reason": self._build_reason(
                    silence=True,
                    too_abstract=too_abstract,
                    too_loopy=too_loopy,
                    user_insists=False,
                ),
            }

        # ------------------------------------------------------------
        # Case 3：沈黙不要
        # ------------------------------------------------------------
        return {
            "silence": False,
            "reason": "threshold_not_reached",
        }

    # ------------------------------------------------------------
    # Reason Builder
    # ------------------------------------------------------------
    def _build_reason(
        self,
        *,
        silence: bool,
        too_abstract: bool,
        too_loopy: bool,
        user_insists: bool,
    ) -> str:
        """
        PersonaOS の debug 情報に入る「理由タグ」を生成する。
        ここは UI で確認するため多少日本語寄りで OK。
        """
        tags = []

        if too_abstract:
            tags.append("abstract_overload")
        if too_loopy:
            tags.append("loop_suspect")
        if user_insists:
            tags.append("user_insists")

        base = "silence_selected" if silence else "reply_selected"

        if tags:
            return f"{base}:" + ",".join(tags)
        return base