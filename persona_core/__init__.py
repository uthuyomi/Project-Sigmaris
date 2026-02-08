"""
Compatibility package.

このリポジトリでは実体の Persona Core は `sigmaris_core/persona_core/` にあります。
過去コード（および一部の現行コード）が `import persona_core.*` の形式を使っているため、
トップレベルに `persona_core` パッケージを用意し、モジュール探索パスを実体へ向けます。

これにより以下が動作します:
- `import persona_core.server_persona_os`
- `from persona_core.memory.selective_recall import SelectiveRecall`
など
"""

from __future__ import annotations

from pathlib import Path

# `persona_core` 配下のサブモジュール探索先を、実体ディレクトリへ向ける
_real_pkg_dir = Path(__file__).resolve().parent.parent / "sigmaris_core" / "persona_core"
__path__ = [str(_real_pkg_dir)]  # type: ignore[name-defined]

