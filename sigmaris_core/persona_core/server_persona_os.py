"""
sigmaris_core/persona_core/server_persona_os.py

Persona OS v2（PersonaController）を FastAPI で公開する、単体のサーバ実装です。

このファイルの狙い:
- 入口を 1つに絞り、処理の流れを追いやすくする
- どこで何をしているか（記憶/同一性/ドリフト/状態/生成/保存）をログで追えるようにする

起動例:
  uvicorn server_persona_os:app --reload --port 8000

トレースログ:
- `SIGMARIS_TRACE=1` で追跡ログ（debug）を出力
- `SIGMARIS_TRACE_TEXT=1` で message/reply のプレビューも出力（個人情報に注意）
"""

from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from persona_core.storage.env_loader import load_dotenv
from persona_core.controller.persona_controller import PersonaController, PersonaControllerConfig
from persona_core.identity.identity_continuity import IdentityContinuityEngineV3
from persona_core.llm.openai_llm_client import OpenAILLMClient
from persona_core.memory.ambiguity_resolver import AmbiguityResolver
from persona_core.memory.episode_merger import EpisodeMerger
from persona_core.memory.episode_store import Episode
from persona_core.memory.memory_orchestrator import MemoryOrchestrator
from persona_core.memory.selective_recall import SelectiveRecall
from persona_core.safety.safety_layer import SafetyLayer
from persona_core.state.global_state_machine import GlobalStateMachine
from persona_core.trace import TRACE_INCLUDE_TEXT, get_logger, new_trace_id, preview_text, trace_event
from persona_core.trait.trait_drift_engine import TraitDriftEngine, TraitState
from persona_core.types.core_types import PersonaRequest
from persona_core.value.value_drift_engine import ValueDriftEngine, ValueState
from persona_core.storage.supabase_rest import SupabaseConfig, SupabaseRESTClient
from persona_core.storage.supabase_store import SupabaseEpisodeStore, SupabasePersonaDB


log = get_logger(__name__)

# `.env` から Supabase/モデル設定を読み込めるようにする（環境変数が優先）
load_dotenv(override=False)

DEFAULT_MODEL = os.getenv("SIGMARIS_PERSONA_MODEL", "gpt-4.1")
DEFAULT_EMBEDDING_MODEL = os.getenv("SIGMARIS_EMBEDDING_MODEL", "text-embedding-3-small")
DEFAULT_USER_ID = os.getenv("SIGMARIS_DEFAULT_USER_ID", "default-user")

_supabase_cfg = SupabaseConfig.from_env()
_supabase: Optional[SupabaseRESTClient]
if _supabase_cfg is not None:
    _supabase = SupabaseRESTClient(_supabase_cfg)
else:
    _supabase = None


def _estimate_overload_score(message: str) -> float:
    """
    overload_score は GlobalStateMachine の入力のひとつです。
    ここでは「入力が長いほど overload」を雑に数値化します（0.0..1.0）。
    """
    n = len(message or "")
    return max(0.0, min(1.0, n / 800.0))  # 800文字で 1.0 目安


# =============================================================
# In-memory EpisodeStore（開発/デモ用）
# - 永続化しない（プロセス再起動で消える）
# =============================================================


class InMemoryEpisodeStore:
    """
    PersonaController が使う Episodic Memory の最小I/F。
    - add(ep)
    - fetch_recent(limit)
    - fetch_by_ids(ids)
    """

    def __init__(self) -> None:
        self._episodes: List[Episode] = []

    def add(self, ep: Episode) -> None:
        self._episodes.append(ep)

    def fetch_recent(self, limit: int = 50) -> List[Episode]:
        return list(self._episodes[-limit:])

    def fetch_by_ids(self, ids: List[str]) -> List[Episode]:
        id_set = set(ids)
        return [ep for ep in self._episodes if ep.episode_id in id_set]


# =============================================================
# In-memory PersonaDB（開発/デモ用）
# - DriftEngine / PersonaController が「保存できるなら保存する」前提で呼ぶAPIのみ実装
# =============================================================


class InMemoryPersonaDB:
    def __init__(self) -> None:
        self.episodes: List[Dict[str, Any]] = []
        self.value_snapshots: List[Dict[str, Any]] = []
        self.trait_snapshots: List[Dict[str, Any]] = []

    def store_episode(
        self,
        *,
        session_id: str,
        role: str,
        content: str,
        topic_hint: Optional[str],
        emotion_hint: Optional[str],
        importance: float,
        meta: Dict[str, Any],
    ) -> None:
        self.episodes.append(
            {
                "session_id": session_id,
                "role": role,
                "content": content,
                "topic_hint": topic_hint,
                "emotion_hint": emotion_hint,
                "importance": importance,
                "meta": meta,
                "timestamp": datetime.now(timezone.utc),
            }
        )

    def store_value_snapshot(
        self,
        *,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Dict[str, Any],
    ) -> None:
        self.value_snapshots.append(
            {
                "user_id": user_id,
                "state": state,
                "delta": delta,
                "meta": meta,
                "timestamp": datetime.now(timezone.utc),
            }
        )

    def store_trait_snapshot(
        self,
        *,
        user_id: Optional[str],
        state: Dict[str, float],
        delta: Dict[str, float],
        meta: Dict[str, Any],
    ) -> None:
        self.trait_snapshots.append(
            {
                "user_id": user_id,
                "state": state,
                "delta": delta,
                "meta": meta,
                "timestamp": datetime.now(timezone.utc),
            }
        )


# =============================================================
# FastAPI Models
# =============================================================


class ChatRequest(BaseModel):
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    message: str

    reward_signal: float = 0.0
    affect_signal: Optional[Dict[str, float]] = None


class ChatResponse(BaseModel):
    reply: str
    meta: Dict[str, Any]


# =============================================================
# Persona OS v2 wiring（組み立て）
# =============================================================


_episode_store = InMemoryEpisodeStore()
_persona_db = InMemoryPersonaDB()

# Safety: このサーバでは “外側” で safety_flag を計算して controller に渡す（後で統合も可能）
_llm_client: Optional[OpenAILLMClient] = None
_inmemory_controller: Optional[PersonaController] = None
_safety_layer: Optional[SafetyLayer] = None


def _get_llm_client() -> OpenAILLMClient:
    """
    OpenAI クライアントは環境変数に依存するため、起動時ではなく必要時に作る。
    - `.env` が未作成でもサーバ自体は起動できる
    - 呼び出し時に設定が無ければ、分かりやすいエラーを返す
    """
    global _llm_client
    if _llm_client is not None:
        return _llm_client

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is missing. "
            "Copy `.env.example` to `.env` and set OPENAI_API_KEY, or export it in the environment."
        )

    _llm_client = OpenAILLMClient(
        model=DEFAULT_MODEL,
        embedding_model=DEFAULT_EMBEDDING_MODEL,
        api_key=api_key,
    )
    return _llm_client


def _get_inmemory_controller() -> PersonaController:
    """
    In-memory 版の wiring を遅延作成して保持する。
    """
    global _inmemory_controller
    if _inmemory_controller is not None:
        return _inmemory_controller

    llm = _get_llm_client()
    embedding_model = llm

    selective_recall = SelectiveRecall(memory_backend=_episode_store, embedding_model=embedding_model)
    ambiguity_resolver = AmbiguityResolver(embedding_model=embedding_model)
    episode_merger = EpisodeMerger(memory_backend=_episode_store)
    memory_orchestrator = MemoryOrchestrator(
        selective_recall=selective_recall,
        episode_merger=episode_merger,
        ambiguity_resolver=ambiguity_resolver,
    )

    _inmemory_controller = PersonaController(
        config=PersonaControllerConfig(default_user_id=None),
        memory_orchestrator=memory_orchestrator,
        identity_engine=IdentityContinuityEngineV3(),
        value_engine=ValueDriftEngine(),
        trait_engine=TraitDriftEngine(),
        global_fsm=GlobalStateMachine(),
        episode_store=_episode_store,
        persona_db=_persona_db,
        llm_client=llm,
        initial_value_state=ValueState(),
        initial_trait_state=TraitState(),
    )
    return _inmemory_controller


def _get_safety_layer(*, embedding_model: Any) -> SafetyLayer:
    """
    SafetyLayer は embedding_model を必要とするため、LLM/embedding が確定してから生成する。
    """
    global _safety_layer
    if _safety_layer is not None:
        return _safety_layer
    _safety_layer = SafetyLayer(embedding_model=embedding_model)
    return _safety_layer


# =============================================================
# FastAPI App
# =============================================================


app = FastAPI(title="Sigmaris Persona OS API", version="1.0.0")


@app.post("/persona/chat", response_model=ChatResponse)
async def persona_chat(req: ChatRequest) -> ChatResponse:
    """
    1ターン分のチャット処理。
    - 入力を PersonaRequest に変換
    - SafetyLayer で safety_flag を判定（簡易）
    - PersonaController.handle_turn(...) に渡して reply を生成
    - meta に内部状態（記憶/同一性/ドリフト/状態）を付けて返す
    """

    trace_id = new_trace_id()
    t0 = time.time()

    user_id = req.user_id or DEFAULT_USER_ID
    session_id = req.session_id or f"{user_id}:{uuid.uuid4().hex}"

    overload_score = _estimate_overload_score(req.message)

    preq = PersonaRequest(
        user_id=user_id,
        session_id=session_id,
        message=req.message,
        context={"_trace_id": trace_id},
    )

    # =========================================================
    # Storage selection
    # - SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY があれば Supabase(Postgres) を正史として使う
    # =========================================================
    if _supabase is not None:
        llm_client = _get_llm_client()
        embedding_model = llm_client

        persona_db = SupabasePersonaDB(_supabase)

        # 直近スナップショットから状態を復元（初回は default）
        init_value = persona_db.load_last_value_state(user_id=user_id) or ValueState()
        init_trait = persona_db.load_last_trait_state(user_id=user_id) or TraitState()

        # user_id ごとに EpisodeStore を分離（同一 user の記憶が永続化される）
        episode_store = SupabaseEpisodeStore(_supabase, user_id=user_id)

        # wiring（requestごとに controller を組み立てて、DBの状態を正とする）
        selective_recall = SelectiveRecall(memory_backend=episode_store, embedding_model=embedding_model)
        ambiguity_resolver = AmbiguityResolver(embedding_model=embedding_model)
        episode_merger = EpisodeMerger(memory_backend=episode_store)
        memory_orchestrator = MemoryOrchestrator(
            selective_recall=selective_recall,
            episode_merger=episode_merger,
            ambiguity_resolver=ambiguity_resolver,
        )

        controller = PersonaController(
            config=PersonaControllerConfig(default_user_id=None),
            memory_orchestrator=memory_orchestrator,
            identity_engine=IdentityContinuityEngineV3(),
            value_engine=ValueDriftEngine(),
            trait_engine=TraitDriftEngine(),
            global_fsm=GlobalStateMachine(),
            episode_store=episode_store,
            persona_db=persona_db,
            llm_client=llm_client,
            initial_value_state=init_value,
            initial_trait_state=init_trait,
        )

        # Safety は復元状態を使って評価
        safety_layer = _get_safety_layer(embedding_model=embedding_model)
        safety = safety_layer.assess(
            req=preq,
            value_state=init_value,
            trait_state=init_trait,
            memory=None,
        )

        # Safety 監査ログ（任意）
        try:
            _supabase.insert(
                "sigmaris_safety_assessments",
                {
                    "trace_id": trace_id,
                    "user_id": user_id,
                    "session_id": session_id,
                    "safety_flag": safety.safety_flag,
                    "risk_score": float(safety.risk_score),
                    "categories": safety.categories,
                    "reasons": safety.reasons,
                    "meta": safety.meta,
                },
            )
        except Exception:
            pass

    else:
        persona_db = _persona_db
        episode_store = _episode_store
        try:
            controller = _get_inmemory_controller()
        except RuntimeError as e:
            # サーバは起動するが、LLMが使えない状態ではAPI呼び出しを明示的に失敗させる
            raise HTTPException(status_code=500, detail=str(e))

        # SafetyLayer は Value/Trait/Memory を受け取れる設計だが、
        # in-memory デモでは「まず追えること」を優先して簡易判定にする。
        llm_client = _get_llm_client()
        safety_layer = _get_safety_layer(embedding_model=llm_client)
        safety = safety_layer.assess(
            req=preq,
            value_state=ValueState(),
            trait_state=TraitState(),
            memory=None,
        )

    trace_event(
        log,
        trace_id=trace_id,
        event="persona_chat.received",
        fields={
            "user_id": user_id,
            "session_id": session_id,
            "message_len": len(req.message or ""),
            "message_preview": preview_text(req.message) if TRACE_INCLUDE_TEXT else "",
            "overload_score": overload_score,
            "safety_flag": safety.safety_flag,
            "risk_score": safety.risk_score,
        },
    )

    result = controller.handle_turn(
        preq,
        user_id=user_id,
        safety_flag=safety.safety_flag,
        overload_score=overload_score,
        reward_signal=req.reward_signal,
        affect_signal=req.affect_signal,
    )

    meta: Dict[str, Any] = {
        "trace_id": trace_id,
        "timing_ms": int((time.time() - t0) * 1000),
        "safety": {
            "flag": safety.safety_flag,
            "risk_score": safety.risk_score,
            "categories": safety.categories,
            "reasons": safety.reasons,
        },
        "memory": result.memory.raw,
        "identity": result.identity.identity_context,
        "value": {"state": result.value.new_state.to_dict(), "delta": result.value.delta},
        "trait": {"state": result.trait.new_state.to_dict(), "delta": result.trait.delta},
        "global_state": result.global_state.to_dict(),
        "controller_meta": result.meta,
        "io": {
            "message_preview": preview_text(req.message) if TRACE_INCLUDE_TEXT else "",
            "reply_preview": preview_text(result.reply_text) if TRACE_INCLUDE_TEXT else "",
        },
    }

    trace_event(
        log,
        trace_id=trace_id,
        event="persona_chat.completed",
        fields={
            "timing_ms": meta["timing_ms"],
            "reply_len": len(result.reply_text or ""),
            "global_state": meta["global_state"].get("state"),
            "memory_pointer_count": meta["memory"].get("initial_pointer_count")
            if isinstance(meta.get("memory"), dict)
            else None,
        },
    )

    return ChatResponse(reply=result.reply_text, meta=meta)
