# server.py
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

from aei.identity import IdentityCore
from aei.episodic_memory import (
    SQLiteEpisodeStore,
    EpisodeArchiveManager,
)
from aei.adapter import LLMAdapter
from aei.reflection import ReflectionCore
from aei.introspection import IntrospectionCore
from aei.psychology.longterm import LongTermPsychology
from aei.psychology.meta_reflection import MetaReflectionCore

# ============================================================
# 設定
# ============================================================

EPISODE_RETENTION = 500  # SQLite に保持する最新件数


# ============================================================
# AEI コアの初期化（サーバ起動時に 1 回）
# ============================================================

identity = IdentityCore()
episodes = SQLiteEpisodeStore(db_path="data/episodes.db")
archiver = EpisodeArchiveManager(archive_dir="data/archive")

# ===========================
# ★ ダミーモードの LLMAdapter
# ===========================

# Reflection（短期）
llm_reflect = LLMAdapter(
    test_mode=True,
    dummy_fn=lambda prompt: """
    {
        "summary": "dummy summary",
        "emotion_hint": "neutral",
        "traits_hint": {
            "calm": 0.7,
            "empathy": 0.7,
            "curiosity": 0.7
        }
    }
    """
)

# Introspection（中期）
llm_intro = LLMAdapter(
    test_mode=True,
    dummy_fn=lambda prompt: """
    {
        "mid_term_summary": "dummy mid summary",
        "pattern": "neutral",
        "trait_adjustment": {
            "calm": 0.0,
            "empathy": 0.0,
            "curiosity": 0.0
        },
        "risk": {
            "drift_warning": false,
            "dependency_warning": false
        }
    }
    """
)

# Meta-Reflection（深層）
llm_meta = LLMAdapter(
    test_mode=True,
    dummy_fn=lambda prompt: """
    {
        "meta_summary": "dummy meta summary",
        "root_cause": "none",
        "adjustment": {
            "calm": 0.0,
            "empathy": 0.0,
            "curiosity": 0.0
        },
        "risk": {
            "identity_drift_risk": false,
            "emotional_collapse_risk": false,
            "over_dependency_risk": false
        }
    }
    """
)

# ============================================================
# コア層
# ============================================================

reflection = ReflectionCore(identity, episodes, llm_reflect.as_function())
introspection = IntrospectionCore(identity, episodes, llm_intro.as_function())
longterm = LongTermPsychology(identity, episodes)
metaref = MetaReflectionCore(identity, episodes, llm_meta.as_function())

app = FastAPI(title="Sigmaris AEI Core API")


# ============================================================
# Helper: 自動アーカイブ
# ============================================================

def trim_and_archive(retention: int = EPISODE_RETENTION) -> None:
    """
    SQLite 内の Episode が retention を超えたら、
    古いものから順にアーカイブ（gzip JSON）して削除する。
    """
    all_eps = episodes.get_all()
    if len(all_eps) <= retention:
        return

    old = all_eps[:-retention]
    path = archiver.archive(old)

    for ep in old:
        episodes.delete(ep.episode_id)

    print(f"[Archive] {len(old)} episodes archived → {path}")


# ============================================================
# Models
# ============================================================

class LogInput(BaseModel):
    text: str
    episode_id: Optional[str] = None


# ============================================================
# API: Reflection（短期）
# ============================================================

@app.post("/reflect")
def api_reflect(inp: LogInput):
    ep = reflection.reflect(inp.text, episode_id=inp.episode_id)

    # ここで「古い Episode のアーカイブ＋削除」
    trim_and_archive()

    return {
        "episode": ep.as_dict(),
        "identity": identity.export_state(),
    }


# ============================================================
# API: Introspection（中期）
# ============================================================

@app.post("/introspect")
def api_introspect():
    res = introspection.introspect()
    return {
        "introspection": res,
        "identity": identity.export_state(),
    }


# ============================================================
# API: LongTerm（長期）
# ============================================================

@app.post("/longterm")
def api_longterm():
    res = longterm.analyze()
    return {
        "longterm": res,
        "identity": identity.export_state(),
    }


# ============================================================
# API: Meta Reflection（深層）
# ============================================================

@app.post("/meta")
def api_meta():
    res = metaref.meta_reflect()
    return {
        "meta": res,
        "identity": identity.export_state(),
    }


# ============================================================
# API: Identity Snapshot
# ============================================================

@app.get("/identity")
def api_identity():
    return identity.export_state()