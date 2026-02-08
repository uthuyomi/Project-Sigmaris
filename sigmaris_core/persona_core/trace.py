from __future__ import annotations

import logging
import os
import uuid
from typing import Any, Dict, Optional


def _env_flag(name: str, default: str = "0") -> bool:
    v = os.getenv(name, default)
    return v not in ("", "0", "false", "False", "no", "No")


TRACE_ENABLED = _env_flag("SIGMARIS_TRACE", "0")
TRACE_INCLUDE_TEXT = _env_flag("SIGMARIS_TRACE_TEXT", "0")


def new_trace_id() -> str:
    return uuid.uuid4().hex


def preview_text(text: Optional[str], max_chars: int = 160) -> str:
    if not text:
        return ""
    t = str(text).replace("\r", " ").replace("\n", " ").strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 1] + "…"


def get_logger(name: str) -> logging.Logger:
    """
    追跡ログ用 logger。

    - `SIGMARIS_TRACE=1` のときだけ `.debug(...)` を実質有効化する運用を想定。
    - ログの出力先/フォーマットはアプリ側で `logging.basicConfig(...)` などで制御する。
    """
    return logging.getLogger(name)


def trace_event(
    logger: logging.Logger,
    *,
    trace_id: str,
    event: str,
    fields: Optional[Dict[str, Any]] = None,
) -> None:
    if not TRACE_ENABLED:
        return
    payload = {"trace_id": trace_id, "event": event}
    if fields:
        payload.update(fields)
    logger.debug("sigmaris_trace %s", payload)

