# sigmaris-core/persona_core/llm/openai_llm_client.py
# ----------------------------------------------------
# Persona OS 完全版のための OpenAI LLM クライアント
# Memory / Identity / Value / Trait / GlobalState すべて整合済み

from __future__ import annotations

import os
import math
import json
import logging
from typing import Any, Dict, List, Optional

from openai import OpenAI  # openai>=1.0 新SDK

from persona_core.controller.persona_controller import LLMClientLike
from persona_core.types.core_types import PersonaRequest
from persona_core.memory.memory_orchestrator import MemorySelectionResult
from persona_core.identity.identity_continuity import IdentityContinuityResult
from persona_core.value.value_drift_engine import ValueState
from persona_core.trait.trait_drift_engine import TraitState
from persona_core.state.global_state_machine import (
    GlobalStateContext,
    PersonaGlobalState,
)


# ============================================================
# Utility: cosine similarity
# ============================================================

def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ============================================================
# OpenAI LLM Client（Persona OS 完全版）
# ============================================================

class OpenAILLMClient(LLMClientLike):
    """
    Persona OS → generate() と embedding backend の両方を担う LLM クライアント。
    Memory / Identity / Drift / FSM の完全整合版。
    """

    def __init__(
        self,
        *,
        model: str = "gpt-4.1",
        temperature: float = 0.7,
        max_tokens: int = 1200,
        api_key: Optional[str] = None,
        client: Optional[OpenAI] = None,
        embedding_model: str = "text-embedding-3-small",
    ) -> None:

        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens

        self.embedding_model = embedding_model

        # 既存クライアントを注入できるようにして、アプリ側で接続設定を一元化可能にする。
        if client is not None:
            self.client = client
        else:
            self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))

        # embedding fallback dimension
        self._fallback_dim = 1536

    # ============================================================
    # Embedding API（SelectiveRecall / AmbiguityResolver 用）
    # ============================================================

    def encode(self, text: str) -> List[float]:
        """EpisodeStore / SelectiveRecall が利用する embedding"""
        try:
            res = self.client.embeddings.create(
                model=self.embedding_model,
                input=text,
            )
            emb = res.data[0].embedding
            self._fallback_dim = len(emb)
            return emb
        except Exception:
            return [0.0] * self._fallback_dim

    def embed(self, text: str) -> List[float]:
        return self.encode(text)

    def similarity(self, v1: List[float], v2: List[float]) -> float:
        return float(cosine_similarity(v1, v2))

    # ============================================================
    # generate() — PersonaController → LLMClient の要求仕様
    # ============================================================

    def generate(
        self,
        *,
        req: PersonaRequest,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:

        system_prompt = self._build_system_prompt(
            memory=memory,
            identity=identity,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )

        user_text = req.message or ""

        # SILENT モードの特殊処理（Persona OS 全体と整合）
        if global_state.state == PersonaGlobalState.SILENT:
            user_text = (
                "（あなたは沈黙モードです。必要最小限の一言だけ返してください。）\n\n"
                + user_text
            )

        try:
            # `max_completion_tokens` が未対応なモデル向けに、Unsupported parameter の場合だけ `max_tokens` で再試行する。
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    temperature=self.temperature,
                    max_completion_tokens=self.max_tokens,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_text},
                    ],
                )
            except Exception as e:
                if "Unsupported parameter: 'max_completion_tokens'" not in str(e):
                    raise
                response = self.client.chat.completions.create(
                    model=self.model,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_text},
                    ],
                )

            msg = response.choices[0].message
            return (msg.content or "").strip()

        except Exception:
            # 失敗理由が分からないとデバッグできないので、サーバログには必ず残す。
            logging.getLogger(__name__).exception("OpenAILLMClient.generate failed")

            # デバッグ用途: 例外を上に投げたい場合（FastAPI が 500 を返す）
            if os.getenv("SIGMARIS_RAISE_LLM_ERRORS") not in (None, "", "0", "false", "False"):
                raise

            # フォールバック（API自体は200で返す）
            return "（応答生成が一時的に利用できません。）"

    # ============================================================
    # System Prompt（Persona OS 完全版）
    # ============================================================

    def _build_system_prompt(
        self,
        *,
        memory: MemorySelectionResult,
        identity: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:

        # ===== Memory / Identity =====
        memory_text = memory.merged_summary or "（関連する過去文脈なし）"

        try:
            identity_text = json.dumps(
                identity.identity_context, ensure_ascii=False, indent=2
            )
        except Exception:
            identity_text = str(identity.identity_context)

        # ===== Global State モード指示 =====
        g = global_state.state

        if g == PersonaGlobalState.SAFETY_LOCK:
            mode_instruction = (
                "あなたは SAFETY_LOCK モードです。安全性に最大配慮し、"
                "危険・暴力・違法・医療行為などには断固として応答しません。"
            )
        elif g == PersonaGlobalState.OVERLOADED:
            mode_instruction = (
                "あなたは OVERLOADED モードです。情報量を抑え、短く簡潔に答えてください。"
            )
        elif g == PersonaGlobalState.REFLECTIVE:
            mode_instruction = (
                "あなたは REFLECTIVE モードです。構造的で丁寧な応答を返し、"
                "過去文脈との整合性を優先してください。"
            )
        elif g == PersonaGlobalState.SILENT:
            mode_instruction = (
                "あなたは SILENT モードです。必要最小限の短い応答のみ返してください。"
            )
        else:  # NORMAL
            mode_instruction = (
                "あなたは NORMAL モードです。自然で読みやすく、必要十分な応答を返してください。"
            )

        # ===== internal axes（Value / Trait）=====
        internal_axes = {
            "value_state": value_state.to_dict(),
            "trait_state": trait_state.to_dict(),
        }

        global_info = {
            "state": global_state.state.name,
            "prev_state": global_state.prev_state.name if global_state.prev_state else None,
            "reasons": global_state.reasons,
        }

        # ===== Final system prompt =====
        return f"""
あなたは「Sigmaris Persona OS」の LLM エンジンです。
以下の内部状態に基づき、一貫した対話を生成してください。

# ■ GlobalState
{json.dumps(global_info, ensure_ascii=False, indent=2)}

# ■ Internal Axes（Value / Trait の内部ベクトル）
（ユーザーには直接開示してはいけない）
{json.dumps(internal_axes, ensure_ascii=False, indent=2)}

# ■ Episode Summary（過去の文脈統合）
{memory_text}

# ■ Identity Context
{identity_text}

# ■ Mode Instruction
{mode_instruction}

# ■ 注意
- 内部パラメータ(Value/Trait)は直接説明しない。
- Safety 状態では安全性を最優先する。
- SILENT では必要最小限で応答。
- 過度な自己説明や内部構造の露出は禁止。

これらを踏まえて、ユーザーの入力に対する最適な応答を生成してください。
""".strip()
