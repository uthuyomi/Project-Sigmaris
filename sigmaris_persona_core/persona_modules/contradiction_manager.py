# sigmaris_persona_core/persona_modules/contradiction_manager.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Any
import re
import time


@dataclass
class ContradictionManager:
    """
    矛盾検出モジュール（PersonaOS 完全版）

    - feed(): 直近のメッセージ（最大32件）を蓄積
    - detect(): 直前の方向性と真逆の表現があれば判定

    PersonaOS では detect() の結果を以下形式で使用する：

        {
          "flags": { "contradiction": bool },
          "note": str | None
        }
    """

    # 保存履歴（content のみ）
    history: List[str] = field(default_factory=list)
    timestamps: List[float] = field(default_factory=list)

    max_history: int = 32

    # 軽量肯定/否定パターン
    POSITIVE = [
        r"そう思う", r"賛成", r"いいと思う", r"そうだね", r"はい", r"ok",
        r"同意", r"なるほど", r"理解した", r"わかる", r"好き", r"興味ある"
    ]
    NEGATIVE = [
        r"そう思わない", r"違う", r"反対", r"よくない", r"だめ", r"無理",
        r"いや", r"納得できない", r"嫌い", r"わからない"
    ]

    def _normalize(self, text: str) -> str:
        """
        ゆらぎを落とす軽量正規化。
        - 小文字
        - 空白削除
        - 句読点除去
        """
        if not text:
            return ""
        t = text.lower().strip()
        t = re.sub(r"[ \t\r\n　]+", "", t)
        t = re.sub(r"[。,.!?！？…]", "", t)
        return t

    # ------------------------------------------------------------
    # Feed
    # ------------------------------------------------------------
    def feed(self, message) -> None:
        """incoming.message.content を保存"""
        content = getattr(message, "content", "")
        if content:
            self.history.append(content)
            self.timestamps.append(time.time())

        # 上限管理
        if len(self.history) > self.max_history:
            self.history.pop(0)
            self.timestamps.pop(0)

    # ------------------------------------------------------------
    # Detect
    # ------------------------------------------------------------
    def detect(self, message) -> Dict[str, Any]:
        """
        「直前の内容」と今回の message を比較し矛盾を検知。
        """

        new_raw = getattr(message, "content", "") or ""
        new_text = self._normalize(new_raw)

        if not self.history:
            return {
                "flags": {"contradiction": False},
                "note": None,
            }

        last_raw = self.history[-1]
        last_text = self._normalize(last_raw)

        # ============================================================
        # 1. 肯定 → 否定 / 否定 → 肯定 の急反転
        # ============================================================
        pos_new = any(re.search(p, new_text) for p in self.POSITIVE)
        neg_new = any(re.search(n, new_text) for n in self.NEGATIVE)
        pos_last = any(re.search(p, last_text) for p in self.POSITIVE)
        neg_last = any(re.search(n, last_text) for n in self.NEGATIVE)

        if (pos_last and neg_new) or (neg_last and pos_new):
            return {
                "flags": {"contradiction": True},
                "note": f"態度の急反転（『{last_raw}』→『{new_raw}』）",
            }

        # ============================================================
        # 2. 単語レベルの反転（できる/できない・行く/行かない）
        # ============================================================
        pairs = [
            ("できる", "できない"),
            ("行く", "行かない"),
        ]

        for pos, neg in pairs:
            if (pos in last_text and neg in new_text) or \
               (neg in last_text and pos in new_text):
                return {
                    "flags": {"contradiction": True},
                    "note": f"意図の逆転（{pos}/{neg}）",
                }

        # ============================================================
        # 3. 否定語の急増
        # ============================================================
        neg_markers = ["違う", "いや", "無理", "否定", "そんなことない"]

        last_neg_count = sum(m in last_text for m in neg_markers)
        new_neg_count = sum(m in new_text for m in neg_markers)

        if (new_neg_count - last_neg_count) >= 3:
            return {
                "flags": {"contradiction": True},
                "note": "否定語の急増",
            }

        # ============================================================
        # 4. 文面の多くが一致しつつ “ない” だけ増える
        #    → 典型的な軽否定 → 強否定の反転パターン
        # ============================================================
        if last_text and new_text.startswith(last_text) and "ない" in new_text:
            return {
                "flags": {"contradiction": True},
                "note": "文面一致からの否定方向への反転",
            }

        # ============================================================
        # Default: 矛盾なし
        # ============================================================
        return {
            "flags": {"contradiction": False},
            "note": None,
        }