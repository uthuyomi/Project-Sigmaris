from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple


_EMOTION_MARKERS = (
    "不安",
    "怖い",
    "こわい",
    "悲しい",
    "つらい",
    "辛い",
    "しんどい",
    "落ち込",
    "泣",
    "怒",
    "イライラ",
    "疲れ",
    "メンタル",
)


def _user_explicitly_emotional(user_text: str) -> bool:
    t = (user_text or "").strip()
    if not t:
        return False
    return any(m in t for m in _EMOTION_MARKERS)


def _is_first_turn(client_history: Optional[List[Dict[str, str]]]) -> bool:
    h = client_history if isinstance(client_history, list) else []
    # If there is any assistant turn in history, it's not the first.
    for m in h:
        if not isinstance(m, dict):
            continue
        if (m.get("role") or "").strip() == "assistant" and (m.get("content") or "").strip():
            return False
    return True


def _has_trigger(text: str, triggers: Tuple[str, ...]) -> bool:
    t = (text or "").strip()
    if not t:
        return False
    return any(x in t for x in triggers)


def postprocess_reply_text(
    *,
    reply_text: str,
    user_text: str,
    client_history: Optional[List[Dict[str, str]]],
    character_id: Optional[str],
    chat_mode: Optional[str],
) -> Tuple[str, Dict[str, Any]]:
    """
    Conservative output hardening:
    - remove non-sequitur catchphrases (character-scoped)
    - remove "meta classification" sentences
    - avoid covert mental-state probing language when the user didn't bring it up

    Keep it meaning-preserving where possible; if we remove, we remove only sentence-level fluff.
    """
    original = str(reply_text or "")
    t = original.strip()

    meta: Dict[str, Any] = {"changed": False, "removed": []}

    cid = (character_id or "").strip().lower()
    cm = (chat_mode or "").strip().lower()

    first = _is_first_turn(client_history)
    user_emotional = _user_explicitly_emotional(user_text)

    # ---- remove meta classification/explanation sentences (AI smell) ----
    # Example: 「きみの『元気？』は、あいさつ。それとも…」 kinds of labeling.
    # We only remove when it's clearly a classification list near the start.
    if "挨拶" in t or "調子チェック" in t:
        lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
        new_lines: List[str] = []
        removed_any = False
        for ln in lines:
            if removed_any:
                new_lines.append(ln)
                continue
            if ("挨拶" in ln or "調子チェック" in ln) and ("それとも" in ln or "どっち" in ln or "？" in ln):
                meta["removed"].append({"type": "meta_classification", "text": ln[:120]})
                removed_any = True
                continue
            new_lines.append(ln)
        if removed_any:
            t = "\n".join(new_lines).strip()

    # ---- Koishi catchphrase guard ----
    # The user explicitly asked: no extra one-liners unless context matches.
    if cid in ("koishi", "komeiji_koishi", "komeiji-koishi") and cm == "roleplay":
        # Triggers: user explicitly references searching/finding/hide-and-seek.
        find_triggers = ("探", "見つけ", "みつけ", "見え", "気づ", "どこ", "かくれんぼ", "隠", "発見")
        hi_triggers = ("やっほ", "こんにちは", "こんち", "はじめまして", "初めて", "挨拶", "雑談")

        allow_find = first or _has_trigger(user_text, find_triggers)
        allow_hi = first or _has_trigger(user_text, hi_triggers)

        # Remove leading "みつけた" if not allowed.
        if not allow_find:
            before = t
            t = re.sub(r"^\s*(みつけた[。！!、,]*\s*)", "", t)
            if t != before:
                meta["removed"].append({"type": "catchphrase", "phrase": "みつけた", "reason": "no_trigger"})

        # Remove leading "やっほー" if not allowed.
        if not allow_hi:
            before = t
            t = re.sub(r"^\s*(やっほー+|やっほ)[。！!、,]*\s*", "", t)
            if t != before:
                meta["removed"].append({"type": "catchphrase", "phrase": "やっほー", "reason": "no_trigger"})

        t = t.strip()

    # ---- Avoid unsolicited mental-state probing / labeling ----
    # If the user did not explicitly bring up feelings, remove sentences that assert user's emotions.
    if not user_emotional and t:
        # Split by Japanese sentence enders; keep conservative.
        parts = re.split(r"(?<=[。！？!?\n])", t)
        kept: List[str] = []
        removed_any = False
        for s in parts:
            ss = s.strip()
            if not ss:
                continue
            # If the sentence contains a 2nd-person reference + emotion label + assertion ending, drop it.
            if re.search(r"(あなた|君|きみ|お前).{0,12}(不安|怒|悲|つら|辛|しんど|落ち込|疲|怖).{0,12}(だ|でしょ|じゃん|だよ)", ss):
                meta["removed"].append({"type": "emotion_label", "text": ss[:120]})
                removed_any = True
                continue
            kept.append(s)
        if removed_any:
            t = "".join(kept).strip()

    meta["changed"] = t != original.strip()
    return t, meta

