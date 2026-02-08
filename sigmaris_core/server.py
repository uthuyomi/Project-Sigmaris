"""
sigmaris_core/server.py

v2（PersonaController）を正史として扱うための互換エントリポイント。

過去の統合サーバ（AEI Core + PersonaOS(v1) + PersonaController(v2)）は整理し、
PersonaController(v2) 単体サーバ（`sigmaris_core/persona_core/server_persona_os.py`）に委譲する。

起動例:
  uvicorn server:app --reload --port 8000
"""

from __future__ import annotations

from persona_core.server_persona_os import app

