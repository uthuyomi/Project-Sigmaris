# sigmaris-core/persona_core/memory/episode_store.py
# ============================================================
# EpisodeStore（Persona OS 完全版・記憶完全版準拠）
# ============================================================

from __future__ import annotations

import json
import os
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timezone


# ============================================================
# Episode Model（完全版 Persona OS 対応）
# ============================================================

@dataclass
class Episode:
    episode_id: str
    timestamp: datetime
    summary: str
    emotion_hint: str
    traits_hint: Dict[str, float]
    raw_context: str
    embedding: Optional[List[float]] = None

    def as_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Episode":
        ts_raw = d.get("timestamp")

        if ts_raw:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except Exception:
                ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return Episode(
            episode_id=d.get("episode_id", ""),
            timestamp=ts,
            summary=d.get("summary", "") or "",
            emotion_hint=d.get("emotion_hint", "") or "",
            traits_hint=d.get("traits_hint", {}) or {},
            raw_context=d.get("raw_context", "") or "",
            embedding=d.get("embedding"),
        )


# ============================================================
# EpisodeStore（JSON backend）
# ============================================================

class EpisodeStore:
    """
    Persona OS 公式 Episodic Memory Store（JSON backend 完全版）
    """

    DEFAULT_PATH = "./sigmaris-data/episodes.json"

    def __init__(self, path: Optional[str] = None) -> None:
        self.path = path or self.DEFAULT_PATH
        os.makedirs(os.path.dirname(self.path), exist_ok=True)

        if not os.path.exists(self.path):
            self._save_json([])

    # --------------------------------------------------------
    # JSON I/O
    # --------------------------------------------------------

    def _load_json(self) -> List[Dict[str, Any]]:
        try:
            if not os.path.exists(self.path):
                self._save_json([])
                return []

            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, list):
                    self._save_json([])
                    return []
                return data

        except Exception:
            self._save_json([])
            return []

    def _save_json(self, raw_list: List[Dict[str, Any]]) -> None:
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(raw_list, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    # --------------------------------------------------------
    # CRUD API
    # --------------------------------------------------------

    def add(self, episode: Episode) -> None:
        raw = self._load_json()
        raw.append(episode.as_dict())
        raw.sort(key=lambda x: x.get("timestamp", ""))
        self._save_json(raw)

    def load_all(self) -> List[Episode]:
        return [Episode.from_dict(d) for d in self._load_json()]

    def get_last(self, n: int = 1) -> List[Episode]:
        eps = self.load_all()
        return eps[-n:] if eps else []

    def count(self) -> int:
        return len(self._load_json())

    # --------------------------------------------------------
    # Analytics
    # --------------------------------------------------------

    def last_summary(self) -> Optional[str]:
        last = self.get_last(1)
        return last[0].summary if last else None

    def trait_trend(self, n: int = 5) -> Dict[str, float]:
        eps = self.get_last(n)
        if not eps:
            return {"calm": 0.0, "empathy": 0.0, "curiosity": 0.0}

        c = sum(ep.traits_hint.get("calm", 0.0) for ep in eps) / len(eps)
        e = sum(ep.traits_hint.get("empathy", 0.0) for ep in eps) / len(eps)
        u = sum(ep.traits_hint.get("curiosity", 0.0) for ep in eps) / len(eps)

        return {
            "calm": round(c, 4),
            "empathy": round(e, 4),
            "curiosity": round(u, 4),
        }

    # --------------------------------------------------------
    # PersonaCore Required API
    # --------------------------------------------------------

    def fetch_recent(self, limit: int = 5) -> List[Episode]:
        eps = self.load_all()
        eps.sort(key=lambda e: e.timestamp, reverse=True)
        return eps[:limit] if eps else []

    def fetch_by_ids(self, ids: List[str]) -> List[Episode]:
        table = {ep.episode_id: ep for ep in self.load_all()}
        return [table[eid] for eid in ids if eid in table]

    def search_embedding(self, vector: List[float], limit: int = 5) -> List[Episode]:
        return self.fetch_recent(limit=limit)

    # --------------------------------------------------------
    # 🔥 LongTermPsychology 必須: get_range()
    # --------------------------------------------------------

    def get_range(self, start: datetime, end: datetime) -> List[Episode]:
        """
        LongTermPsychology が利用する期間抽出 API（完全版）。
        - start <= timestamp <= end
        - timestamp 昇順で返す
        """
        eps = self.load_all()
        result: List[Episode] = []

        # UTC で比較
        s = start.astimezone(timezone.utc)
        e = end.astimezone(timezone.utc)

        for ep in eps:
            ts = ep.timestamp
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)

            if s <= ts <= e:
                result.append(ep)

        # 昇順
        result.sort(key=lambda ep: ep.timestamp)
        return result