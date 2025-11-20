# aei/adapter/llm_adapter.py
from __future__ import annotations

import json
import os
from typing import Callable, Dict, Any, Optional

from openai import OpenAI


# ============================================================
# 公開される唯一の関数型表現（AEI 全体で統一）
# ============================================================
LLMFn = Callable[[str], str]


class LLMAdapter:
    """
    Sigmaris OS — LLM Adapter
    -------------------------

    AEI Core（Python）と外部LLM（GPT等）を安全・安定に接続するレイヤ。

    - JSON を強制（暴走抑止）
    - OpenAI SDK の仕様変更を 1 箇所に隔離
    - test_mode / dummy_fn によるユニットテストが容易
    - Reflection / Introspection / LongTermPsychology が
      期待する LLMFn: (str) -> str を一貫提供
    """

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        api_key: Optional[str] = None,
        temperature: float = 0.2,
        timeout: int = 30,
        test_mode: bool = False,
        dummy_fn: Optional[LLMFn] = None,
    ) -> None:

        self.model = model
        self.temperature = temperature
        self.timeout = timeout
        self.test_mode = bool(test_mode)
        self.dummy_fn = dummy_fn

        # ==== OpenAI Client 初期化 ====
        if not self.test_mode:
            key = api_key or os.getenv("OPENAI_API_KEY")
            if not key:
                raise RuntimeError("OPENAI_API_KEY is not set and no api_key was given.")
            self.client = OpenAI(api_key=key)
        else:
            self.client = None  # test mode

    # ============================================================
    # コア：プロンプト → JSON文字列
    # ============================================================
    def run(self, prompt: str) -> str:
        """
        LLM にプロンプトを投げ、必ず JSON 文字列を返す。

        AEI Core（Reflection / Introspection / LongTermPsychology）は
        このメソッドだけを直接使う。
        """

        # ---- test_mode: ダミーLLM ----
        if self.test_mode:
            if self.dummy_fn is None:
                raise RuntimeError("test_mode=True but dummy_fn is None.")
            result = self.dummy_fn(prompt)
            if not isinstance(result, str):
                raise RuntimeError("dummy_fn must return a JSON string.")
            return result

        # ---- OpenAI API ----
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                messages=[
                    {
                        "role": "system",
                        "content": "You must return ONLY JSON. No explanations. No markdown."
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=800,
                timeout=self.timeout,
            )

            # message 構造の互換性確保
            msg = resp.choices[0].message
            if isinstance(msg, dict):
                text = msg["content"].strip()
            else:
                text = msg.content.strip()

        except Exception as e:
            raise RuntimeError(f"OpenAI request failed: {e}")

        # ---- JSON 妥当性チェック ----
        try:
            json.loads(text)
        except json.JSONDecodeError:
            raise RuntimeError(f"LLM output is NOT valid JSON:\n{text}")

        return text

    # ============================================================
    # AEI が利用する関数型インターフェース
    # ============================================================
    def as_function(self) -> LLMFn:
        """
        ReflectionCore / IntrospectionCore / LongTermPsychology が
        共通で期待する “LLMFn: (str) -> str” を返す。
        """
        return self.run

    # ============================================================
    # デバッグ（JSON を dict で返す）
    # ============================================================
    def debug_run(self, prompt: str) -> Dict[str, Any]:
        raw = self.run(prompt)
        return json.loads(raw)