"""
sigmaris_core/persona_core/phase03/naturalness_controller.py

Conversation naturalness controller (v1).

Goal:
- Reduce "interview / over-structured" feel by default.
- Keep core design: core owns final control; clients may pass persona_system, but this layer can
  softly steer style/turn-taking.

This module is deterministic and lightweight. It does not call LLMs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


def _clamp_int(v: Any, lo: int = 0, hi: int = 3, default: int = 1) -> int:
    try:
        n = int(v)
    except Exception:
        n = int(default)
    if n < lo:
        return lo
    if n > hi:
        return hi
    return n


def _contains_any(text: str, needles: List[str]) -> bool:
    t = (text or "")
    return any(n in t for n in needles if n)


def _count_questions(text: str) -> int:
    t = text or ""
    return t.count("?") + t.count("？")


@dataclass
class NaturalnessParams:
    # core
    structure_level: int = 1
    question_rate: int = 1
    initiative_level: int = 1
    empathy_level: int = 1
    directness: int = 1
    verbosity: int = 1
    roleplay_strength: int = 1
    confidence_calibration: int = 1
    # extended
    humor_level: int = 1
    formality: int = 1
    followup_depth: int = 1
    novelty_vs_precision: int = 1
    self_disclosure: int = 1
    tool_suggestiveness: int = 1
    memory_reference_rate: int = 1
    safety_caution: int = 1

    def clamp(self) -> "NaturalnessParams":
        for k in self.__dataclass_fields__.keys():  # type: ignore[attr-defined]
            setattr(self, k, _clamp_int(getattr(self, k)))
        return self

    def as_dict(self) -> Dict[str, int]:
        return {k: int(getattr(self, k)) for k in self.__dataclass_fields__.keys()}  # type: ignore[attr-defined]

    @classmethod
    def from_dict(cls, d: Optional[Dict[str, Any]] = None) -> "NaturalnessParams":
        d = d if isinstance(d, dict) else {}
        obj = cls()
        for k in obj.__dataclass_fields__.keys():  # type: ignore[attr-defined]
            if k in d:
                setattr(obj, k, _clamp_int(d.get(k)))
        return obj.clamp()


@dataclass
class NaturalnessState:
    params: NaturalnessParams = field(default_factory=NaturalnessParams)
    prev_assistant_len: int = 0
    prev_user_len: int = 0

    def as_dict(self) -> Dict[str, Any]:
        return {
            "params": self.params.as_dict(),
            "prev_assistant_len": int(self.prev_assistant_len),
            "prev_user_len": int(self.prev_user_len),
        }


def detect_user_wants_choices(user_text: str) -> bool:
    t = (user_text or "").strip()
    if not t:
        return False
    return _contains_any(
        t,
        [
            "選択肢",
            "候補",
            "どれがいい",
            "どれが良い",
            "どれにする",
            "どれにすれば",
            "オプション",
            "案を出して",
            "いくつか",
            "何個か",
            "提案して",
        ],
    )


def _is_technical(user_text: str) -> bool:
    t = (user_text or "").strip()
    if not t:
        return False
    tech_markers = [
        "エラー",
        "例外",
        "stack",
        "trace",
        "TypeScript",
        "JavaScript",
        "Python",
        "Rust",
        "Go",
        "Java",
        "SQL",
        "API",
        "HTTP",
        "Next.js",
        "React",
        "Docker",
        "Vercel",
        "Fly.io",
        "Supabase",
        "ビルド",
        "デプロイ",
        "実装",
        "修正",
        "コード",
        "関数",
        "クラス",
        "バグ",
        "ログ",
        "diff",
        "PR",
        "commit",
    ]
    if _contains_any(t, tech_markers):
        return True
    if "```" in t or ("{" in t and "}" in t) or ("(" in t and ")" in t and ";" in t):
        return True
    return False


def _is_emotional(user_text: str) -> bool:
    t = (user_text or "").strip()
    if not t:
        return False
    return _contains_any(
        t,
        [
            "不安",
            "怖い",
            "しんどい",
            "つらい",
            "モヤ",
            "イライラ",
            "悲しい",
            "寂しい",
            "怒り",
            "焦り",
            "疲れ",
            "落ち込",
            "悩",
        ],
    )


def _is_casual_short(user_text: str) -> bool:
    t = (user_text or "").strip()
    if not t:
        return True
    return len(t) <= 18 and not _is_technical(t)


def update_params_on_user(
    state: NaturalnessState, *, user_text: str
) -> Tuple[NaturalnessState, Dict[str, Any]]:
    """
    Update params based on user text (per-turn max +/-1).
    Returns (new_state, debug_update_meta).
    """
    before = state.params.as_dict()
    p = NaturalnessParams.from_dict(before)

    # Self-correction signal (user replied short after long assistant answer).
    if state.prev_assistant_len >= 600 and len((user_text or "").strip()) <= 18:
        p.structure_level = max(0, p.structure_level - 1)
        p.question_rate = max(0, p.question_rate - 1)
        p.verbosity = max(0, p.verbosity - 1)

    if _is_emotional(user_text):
        p.empathy_level = min(3, p.empathy_level + 1)
        p.directness = max(0, p.directness - 1)

    if _is_technical(user_text):
        p.structure_level = min(3, p.structure_level + 1)
        p.directness = min(3, p.directness + 1)
        p.novelty_vs_precision = min(3, p.novelty_vs_precision + 1)

    if _is_casual_short(user_text):
        p.verbosity = max(0, p.verbosity - 1)
        p.structure_level = max(0, p.structure_level - 1)
        p.question_rate = max(0, p.question_rate - 1)

    # Clamp (safety)
    p.clamp()
    state.params = p

    after = state.params.as_dict()
    delta = {k: after[k] - before.get(k, 1) for k in after.keys()}
    changed = {k: v for k, v in delta.items() if v != 0}
    return state, {"delta": changed, "before": before, "after": after}


def self_assess_and_correct(
    state: NaturalnessState, *, user_text: str, assistant_text: str, allow_choices: bool
) -> Tuple[NaturalnessState, Dict[str, Any]]:
    """
    Post-turn evaluation and correction.
    """
    t_user = (user_text or "").strip()
    t_asst = (assistant_text or "").strip()

    flags: Dict[str, bool] = {
        "was_overstructured": False,
        "was_too_interview_like": False,
        "did_user_short_reply_after_long_answer": False,
    }

    # Detect "interview-like" / choice templates. (Even if allow_choices, don't encourage template spam.)
    interview_markers = [
        "どれにする",
        "どれが近い",
        "OKなら",
        "進めていい",
        "選んで",
        "どっち",
        "どちら",
    ]
    if _count_questions(t_asst) >= 2 or _contains_any(t_asst, interview_markers):
        flags["was_too_interview_like"] = True

    # Over-structured: excessive bullets/headings in casual context.
    bullet_like = t_asst.count("\n- ") + t_asst.count("\n・") + t_asst.count("\n* ")
    heading_like = t_asst.count("\n## ") + t_asst.count("\n### ")
    if (_is_casual_short(t_user) and (bullet_like + heading_like) >= 3) or heading_like >= 2:
        flags["was_overstructured"] = True

    # User short after long assistant answer: this turn's user message (t_user) is already known; use prev assistant.
    if state.prev_assistant_len >= 600 and len(t_user) <= 18:
        flags["did_user_short_reply_after_long_answer"] = True

    # Apply corrections (per-turn max -1).
    before = state.params.as_dict()
    p = NaturalnessParams.from_dict(before)

    if flags["was_overstructured"]:
        p.structure_level = max(0, p.structure_level - 1)
        p.verbosity = max(0, p.verbosity - 1)
    if flags["was_too_interview_like"]:
        p.question_rate = max(0, p.question_rate - 1)
        p.initiative_level = max(0, p.initiative_level - 1)
        p.directness = max(0, p.directness - 1)

    # Additional guard: if choices were not requested, strongly discourage multi-question next turn.
    if not allow_choices and _count_questions(t_asst) >= 2:
        p.question_rate = 0

    p.clamp()
    state.params = p

    state.prev_user_len = len(t_user)
    state.prev_assistant_len = len(t_asst)

    after = state.params.as_dict()
    delta = {k: after[k] - before.get(k, 1) for k in after.keys()}
    changed = {k: v for k, v in delta.items() if v != 0}
    return state, {"flags": flags, "delta": changed, "before": before, "after": after}


def build_naturalness_system(
    *,
    params: NaturalnessParams,
    allow_choices: bool,
) -> str:
    """
    Convert params into a short system instruction block.
    Keep it compact and stable (avoid long essays).
    """
    p = params.clamp()

    # Baseline forced rules.
    forced = [
        "You are in a public chat product. Prioritize natural back-and-forth over interview/coaching tone.",
        "Do NOT ask for permission templates (e.g., 'read it?', 'summarize it?', 'OK to proceed?'). Just proceed.",
        "Do NOT automatically present multiple-choice options unless the user explicitly asked for options.",
        "Ask at most ONE question per turn.",
    ]
    if allow_choices:
        forced.append("User asked for options/choices, so you may present a small set of options (max 3).")

    # Style mapping (very lightweight).
    style: List[str] = []
    if p.structure_level <= 1:
        style.append("Default to prose. Avoid headings and heavy bullet lists.")
    elif p.structure_level == 2:
        style.append("You may use a short list if it truly helps, otherwise keep prose.")
    else:
        style.append("Structured answer is allowed, but keep it concise and avoid feeling like an interview.")

    if p.verbosity <= 1:
        style.append("Keep replies short-to-medium. Avoid over-explaining.")
    else:
        style.append("Longer replies are allowed if the user asked for depth.")

    if p.question_rate == 0:
        style.append("Prefer zero questions unless necessary to avoid misunderstanding.")
    else:
        style.append("If you ask a question, ask only one and make it easy to answer.")

    if p.empathy_level >= 2:
        style.append("Acknowledge the user's feeling in one short sentence when relevant.")

    if p.directness <= 1:
        style.append("Avoid strong conclusions. Speak softly and tentatively when uncertain.")
    elif p.directness >= 2:
        style.append("Be reasonably direct, but avoid pushy coaching phrasing.")

    if p.roleplay_strength <= 1:
        style.append("Keep character flavor subtle; do not derail the conversation.")
    else:
        style.append("Maintain character voice, but do not sacrifice clarity.")

    # Combine.
    lines = ["# Natural Dialogue Policy (v1)"]
    lines += [f"- {x}" for x in forced]
    lines.append("")
    lines.append("## Style knobs (internal)")
    lines += [f"- {x}" for x in style]
    lines.append("")
    lines.append("## Current params (0-3)")
    lines.append(str(p.as_dict()))
    return "\n".join(lines).strip()


def sanitize_reply_text(
    *,
    reply_text: str,
    allow_choices: bool,
) -> Tuple[str, Dict[str, Any]]:
    """
    Hardening layer for the "forced rules".

    Note:
    - We keep it conservative to avoid breaking meaning.
    - The client UI may stream partial deltas; the final 'done.reply' can still be corrected.
    """
    original = str(reply_text or "")
    t = original

    removed_templates: List[str] = []

    # Remove permission-template questions (keep content minimal).
    permission_templates = [
        "読み取っていい？",
        "読んでいい？",
        "要約していい？",
        "進めていい？",
        "OKなら進める",
        "OKならこのまま",
    ]
    for p in permission_templates:
        if p in t:
            removed_templates.append(p)
            t = t.replace(p, "")

    # Remove explicit interview/choice prompts if user didn't ask for choices.
    if not allow_choices:
        interview_prompts = [
            "どれにする？",
            "どれが近い？",
            "どっち？",
            "どちら？",
            "選んで。",
            "選んで",
        ]
        for p in interview_prompts:
            if p in t:
                removed_templates.append(p)
                t = t.replace(p, "")

    # Enforce max ONE question mark per turn.
    q_total = _count_questions(t)
    if q_total > 1:
        seen = 0
        out_chars: List[str] = []
        for ch in t:
            if ch in ("?", "？"):
                seen += 1
                if seen >= 2:
                    out_chars.append("。")
                    continue
            out_chars.append(ch)
        t = "".join(out_chars)

    # Clean up double spaces/newlines from removals.
    while "\n\n\n" in t:
        t = t.replace("\n\n\n", "\n\n")
    t = t.strip()

    meta = {
        "changed": t != original,
        "removed_templates": removed_templates[:10],
        "question_count_before": int(_count_questions(original)),
        "question_count_after": int(_count_questions(t)),
    }
    return t, meta
