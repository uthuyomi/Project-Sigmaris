# sigmaris-core/persona_core/controller/persona_controller.py
#
# Persona OS 完全版 — 1ターン統合制御
# Memory / Identity / Drift / FSM / LLM / PersonaDB との完全整合版
#
# 修正方針（既存構造は削らない）：
# - user_id が None になりうる経路を潰す
# - identity_result / global_state の属性差異を安全に吸収
# - memory_result.raw を meta・DB 保存の双方に確実に載せる

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Optional
from datetime import datetime, timezone

from persona_core.memory.episode_store import Episode
from persona_core.types.core_types import PersonaRequest
from persona_core.trace import TRACE_INCLUDE_TEXT, get_logger, preview_text, trace_event

from persona_core.memory.memory_orchestrator import (
    MemoryOrchestrator,
    MemorySelectionResult,
)

from persona_core.identity.identity_continuity import (
    IdentityContinuityEngineV3,
    IdentityContinuityResult,
)

from persona_core.value.value_drift_engine import (
    ValueDriftEngine,
    ValueDriftResult,
    ValueState,
)

from persona_core.trait.trait_drift_engine import (
    TraitDriftEngine,
    TraitDriftResult,
    TraitState,
)

from persona_core.state.global_state_machine import (
    GlobalStateMachine,
    GlobalStateContext,
    PersonaGlobalState,
)


# --------------------------------------------------------------
# LLM client interface
# --------------------------------------------------------------

class LLMClientLike:
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
        raise NotImplementedError


# --------------------------------------------------------------
# 設定型 / 結果型
# --------------------------------------------------------------

@dataclass
class PersonaControllerConfig:
    enable_reflection: bool = False
    default_user_id: Optional[str] = None


@dataclass
class PersonaTurnResult:
    reply_text: str
    memory: MemorySelectionResult
    identity: IdentityContinuityResult
    value: ValueDriftResult
    trait: TraitDriftResult
    global_state: GlobalStateContext
    meta: Dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------
# PersonaController 本体
# --------------------------------------------------------------

class PersonaController:
    """
    Persona OS 完全版のワンターン統合制御クラス。
    """

    def __init__(
        self,
        *,
        config: Optional[PersonaControllerConfig] = None,
        memory_orchestrator: MemoryOrchestrator,
        identity_engine: IdentityContinuityEngineV3,
        value_engine: ValueDriftEngine,
        trait_engine: TraitDriftEngine,
        global_fsm: GlobalStateMachine,
        episode_store: Any,
        persona_db: Any,
        llm_client: LLMClientLike,
        initial_value_state: Optional[ValueState] = None,
        initial_trait_state: Optional[TraitState] = None,
    ) -> None:

        self._config = config or PersonaControllerConfig()

        # Engines
        self._memory = memory_orchestrator
        self._identity = identity_engine
        self._value = value_engine
        self._trait = trait_engine
        self._fsm = global_fsm

        # Backends
        self._episode_store = episode_store
        self._db = persona_db
        self._llm = llm_client

        # Internal states
        self._value_state = initial_value_state or ValueState()
        self._trait_state = initial_trait_state or TraitState()
        self._prev_global_state: Optional[PersonaGlobalState] = None

    # ==========================================================
    # Main turn
    # ==========================================================

    def handle_turn(
        self,
        req: PersonaRequest,
        *,
        user_id: Optional[str] = None,
        safety_flag: Optional[str] = None,
        overload_score: Optional[float] = None,
        reward_signal: float = 0.0,
        affect_signal: Optional[Dict[str, float]] = None,
    ) -> PersonaTurnResult:

        # ------------------------------------------------------
        # Trace（任意）
        # - server_persona_os.py が PersonaRequest.metadata に `_trace_id` を埋めてくれた場合のみ出力
        # ------------------------------------------------------
        log = get_logger(__name__)
        trace_id: Optional[str]
        try:
            trace_id = (getattr(req, "metadata", None) or {}).get("_trace_id")
        except Exception:
            trace_id = None

        def _trace(event: str, fields: Optional[Dict[str, Any]] = None) -> None:
            if not trace_id:
                return
            trace_event(
                log,
                trace_id=str(trace_id),
                event=f"persona_controller.{event}",
                fields=fields,
            )

        # user_id の最終確定（None 落ち防止）
        uid: Optional[str] = (
            user_id
            or self._config.default_user_id
            or getattr(req, "user_id", None)
        )

        meta: Dict[str, Any] = {}

        _trace(
            "start",
            {
                "user_id": uid,
                "session_id": getattr(req, "session_id", None),
                "message_len": len(getattr(req, "message", "") or ""),
                "message_preview": preview_text(getattr(req, "message", "")) if TRACE_INCLUDE_TEXT else "",
                "safety_flag": safety_flag,
                "overload_score": overload_score,
                "reward_signal": reward_signal,
            },
        )

        # ---- 1) Memory selection ----
        memory_result = self._select_memory(req=req, user_id=uid)

        meta["memory"] = {
            "pointer_count": len(memory_result.pointers),
            "has_merged_summary": memory_result.merged_summary is not None,
            "raw": memory_result.raw,  # ★ 透過
        }

        _trace(
            "memory_selected",
            {
                "pointer_count": len(memory_result.pointers),
                "has_merged_summary": memory_result.merged_summary is not None,
            },
        )

        # ---- 2) Identity continuity ----
        identity_result = self._identity.build_identity_context(
            req=req,
            memory=memory_result,
        )

        _trace(
            "identity_built",
            {
                "topic_label": (identity_result.identity_context or {}).get("topic_label"),
                "has_past_context": (identity_result.identity_context or {}).get("has_past_context"),
            },
        )

        # ---- 3) Value drift ----
        value_result = self._value.apply(
            current=self._value_state,
            req=req,
            memory=memory_result,
            identity=identity_result,
            reward_signal=reward_signal,
            safety_flag=safety_flag,
            db=self._db,
            user_id=uid,
        )
        self._value_state = value_result.new_state

        _trace("value_drift", {"delta": getattr(value_result, "delta", None)})

        # ---- 4) Trait drift ----
        trait_result = self._trait.apply(
            current=self._trait_state,
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=self._value_state,
            affect_signal=affect_signal,
            db=self._db,
            user_id=uid,
        )
        self._trait_state = trait_result.new_state

        _trace("trait_drift", {"delta": getattr(trait_result, "delta", None)})

        # ---- 5) Global FSM ----
        global_state_ctx = self._fsm.decide(
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=self._value_state,
            trait_state=self._trait_state,
            safety_flag=safety_flag,
            overload_score=overload_score,
            prev_state=self._prev_global_state,
        )
        self._prev_global_state = global_state_ctx.state

        _trace(
            "global_state",
            {
                "state": global_state_ctx.state.name,
                "prev_state": global_state_ctx.prev_state.name if global_state_ctx.prev_state else None,
                "reasons": global_state_ctx.reasons,
            },
        )

        # ---- 6) LLM generate ----
        reply_text = self._call_llm(
            req=req,
            memory_result=memory_result,
            identity_result=identity_result,
            value_state=self._value_state,
            trait_state=self._trait_state,
            global_state=global_state_ctx,
        )

        # ---- 7) EpisodeStore / PersonaDB 保存 ----
        _trace(
            "llm_generated",
            {
                "reply_len": len(reply_text or ""),
                "reply_preview": preview_text(reply_text) if TRACE_INCLUDE_TEXT else "",
            },
        )

        self._store_episode(
            user_id=uid,
            req=req,
            reply_text=reply_text,
            memory_result=memory_result,
            identity_result=identity_result,
            global_state=global_state_ctx,
        )

        _trace("stored", None)

        # ---- meta ----
        try:
            gs_dict = global_state_ctx.to_dict()
        except Exception:
            gs_dict = {"state": getattr(global_state_ctx, "state", None)}

        meta.update(
            {
                "value_delta": getattr(value_result, "delta", None),
                "trait_delta": getattr(trait_result, "delta", None),
                "global_state": gs_dict,
                "reward_signal": reward_signal,
                "safety_flag": safety_flag,
                "overload_score": overload_score,
            }
        )

        return PersonaTurnResult(
            reply_text=reply_text,
            memory=memory_result,
            identity=identity_result,
            value=value_result,
            trait=trait_result,
            global_state=global_state_ctx,
            meta=meta,
        )

    # ==========================================================
    # Memory orchestrator
    # ==========================================================

    def _select_memory(
        self,
        *,
        req: PersonaRequest,
        user_id: Optional[str],
    ) -> MemorySelectionResult:
        return self._memory.select(
            req=req,
            user_id=user_id,
            episode_store=self._episode_store,
            persona_db=self._db,
        )

    # ==========================================================
    # LLM 呼び出し
    # ==========================================================

    def _call_llm(
        self,
        *,
        req: PersonaRequest,
        memory_result: MemorySelectionResult,
        identity_result: IdentityContinuityResult,
        value_state: ValueState,
        trait_state: TraitState,
        global_state: GlobalStateContext,
    ) -> str:
        return self._llm.generate(
            req=req,
            memory=memory_result,
            identity=identity_result,
            value_state=value_state,
            trait_state=trait_state,
            global_state=global_state,
        )

    # ==========================================================
    # Episode / DB 保存
    # ==========================================================

    def _store_episode(
        self,
        *,
        user_id: Optional[str],
        req: PersonaRequest,
        reply_text: str,
        memory_result: MemorySelectionResult,
        identity_result: IdentityContinuityResult,
        global_state: GlobalStateContext,
    ) -> None:

        req_text = (req.message or "") if req is not None else ""

        # identity_context 互換吸収
        identity_context = getattr(identity_result, "identity_context", None)
        if identity_context is None:
            identity_context = getattr(identity_result, "context", None) or {}

        # global_state dict 互換
        try:
            gs_dict = global_state.to_dict()
        except Exception:
            gs_dict = {"state": getattr(global_state, "state", None)}

        ep = Episode(
            episode_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            summary=(reply_text or "")[:120],
            emotion_hint="",
            traits_hint={},
            raw_context=req_text,
            embedding=None,
        )

        # embedding 対応
        try:
            if hasattr(self._llm, "encode"):
                ep.embedding = self._llm.encode(ep.summary)  # type: ignore
            elif hasattr(self._llm, "embed"):
                ep.embedding = self._llm.embed(ep.summary)  # type: ignore
        except Exception:
            ep.embedding = None

        # EpisodeStore
        try:
            if hasattr(self._episode_store, "add"):
                self._episode_store.add(ep)
        except Exception:
            pass

        if self._db is None:
            return

        meta = {
            "user_id": user_id,
            "trace_id": (getattr(req, "metadata", None) or {}).get("_trace_id"),
            "identity_context": identity_context,
            "global_state": gs_dict,
            "memory_pointers": [p.__dict__ for p in (memory_result.pointers or [])],
            "memory_raw": memory_result.raw or {},
        }

        # ---- legacy API ----
        if hasattr(self._db, "store_episode_record"):
            try:
                self._db.store_episode_record(
                    user_id=user_id,
                    request=req_text,
                    response=reply_text,
                    meta=meta,
                )
            except Exception:
                pass
            return

        # ---- full API ----
        if hasattr(self._db, "store_episode"):
            try:
                session_id = getattr(req, "session_id", None) or str(uuid.uuid4())

                self._db.store_episode(
                    session_id=session_id,
                    role="user",
                    content=req_text,
                    topic_hint=None,
                    emotion_hint=None,
                    importance=0.0,
                    meta={
                        "direction": "input",
                        "user_id": user_id,
                        "identity_context": identity_context,
                        "global_state": gs_dict,
                    },
                )

                self._db.store_episode(
                    session_id=session_id,
                    role="assistant",
                    content=reply_text,
                    topic_hint=None,
                    emotion_hint=None,
                    importance=0.0,
                    meta={
                        "direction": "output",
                        "user_id": user_id,
                        "identity_context": identity_context,
                        "global_state": gs_dict,
                        "memory_pointers": [p.__dict__ for p in (memory_result.pointers or [])],
                        "memory_raw": memory_result.raw or {},
                    },
                )

            except Exception:
                pass
