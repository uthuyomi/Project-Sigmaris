# aei/episodic_memory/epmem.py
from __future__ import annotations

import json
import os
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

# =====================================================================
# Episode Model
# =====================================================================

@dataclass
class Episode:
    """
    AEI Episodic Memory Unit
    - summary: 内省または出来事の要約
    - emotion_hint: AEI の情動ラベル
    - traits_hint: calm/empathy/curiosity の観測値
    - raw_context: 元ログ（会話全文など）
    """

    episode_id: str
    timestamp: datetime
    summary: str
    emotion_hint: str
    traits_hint: Dict[str, float]
    raw_context: str

    def as_dict(self) -> Dict[str, Any]:
        """
        Episode → JSON（安全形式）
        timestamp は常に ISO8601 + UTC
        """
        d = asdict(self)
        d["timestamp"] = self.timestamp.astimezone(timezone.utc).isoformat()
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Episode":
        """
        JSON → Episode（破損救済込み）
        """
        ts_raw = d.get("timestamp")
        if not ts_raw:
            ts = datetime.now(timezone.utc)
        else:
            try:
                ts = datetime.fromisoformat(ts_raw)
            except Exception:
                ts = datetime.now(timezone.utc)

        # naive → UTC
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        return Episode(
            episode_id=d.get("episode_id", ""),
            timestamp=ts,
            summary=d.get("summary", ""),
            emotion_hint=d.get("emotion_hint", ""),
            traits_hint=d.get("traits_hint", {}) or {},
            raw_context=d.get("raw_context", ""),
        )

# =====================================================================
# EpisodeStore
# =====================================================================

class EpisodeStore:
    """
    Sigmaris OS — Episodic Memory Store
    """
    DEFAULT_PATH = "./sigmaris-data/episodes.json"

    def __init__(self, path: str = None) -> None:
        self.path = path or self.DEFAULT_PATH

        # ディレクトリ準備
        os.makedirs(os.path.dirname(self.path), exist_ok=True)

        # episodes.json が無ければ自動生成
        if not os.path.exists(self.path):
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump([], f, ensure_ascii=False, indent=2)

    # ------------------------------------------------------------ #
    # Low-level I/O（破損救済対応）
    # ------------------------------------------------------------ #

    def _load_json(self) -> List[Dict[str, Any]]:
        """
        episodes.json を読み込む。
        壊れていれば初期化して空リストに戻す。
        """
        if not os.path.exists(self.path):
            # 自動初期化
            self._save_json([])
            return []

        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            # 壊れてる → 初期化して復旧
            self._save_json([])
            return []

    def _save_json(self, raw_list: List[Dict[str, Any]]) -> None:
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(raw_list, f, ensure_ascii=False, indent=2)

    # ------------------------------------------------------------ #
    # CRUD
    # ------------------------------------------------------------ #

    def add(self, episode: Episode) -> None:
        """
        Episode を追加し、時系列順にソートして保存。
        """
        raw = self._load_json()
        raw.append(episode.as_dict())

        raw.sort(key=lambda x: x.get("timestamp", ""))

        self._save_json(raw)

    def load_all(self) -> List[Episode]:
        raw = self._load_json()
        return [Episode.from_dict(d) for d in raw]

    def get_last(self, n: int = 1) -> List[Episode]:
        eps = self.load_all()
        return eps[-n:] if eps else []

    def get_range(self, start: datetime, end: datetime) -> List[Episode]:
        eps = self.load_all()
        return [ep for ep in eps if start <= ep.timestamp <= end]

    def count(self) -> int:
        return len(self._load_json())

    # ------------------------------------------------------------ #
    # Analytics（心理・長期内省）
    # ------------------------------------------------------------ #

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

    # ------------------------------------------------------------ #
    # Export
    # ------------------------------------------------------------ #

    def export_state(self) -> Dict[str, Any]:
        eps = self.load_all()
        return {
            "count": len(eps),
            "episodes": [ep.as_dict() for ep in eps],
            "trait_trend": self.trait_trend(n=10),
        }