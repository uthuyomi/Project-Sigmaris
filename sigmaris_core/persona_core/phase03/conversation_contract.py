from __future__ import annotations

import re
from typing import Any, Dict, Optional


_EXPLICIT_GOAL_PREFIXES = (
    "目的:",
    "目標:",
    "ゴール:",
    "やりたいこと:",
    "要件:",
    "Goal:",
    "goal:",
)


def extract_explicit_goal(user_text: str) -> Optional[str]:
    """
    Conservative goal extraction.
    Only captures when the user explicitly labels a goal (目的/目標/ゴール/やりたいこと/要件/Goal).
    """
    t = (user_text or "").strip()
    if not t:
        return None

    # Look for a labeled goal at the beginning of a line.
    for line in t.splitlines():
        s = line.strip()
        if not s:
            continue
        for p in _EXPLICIT_GOAL_PREFIXES:
            if s.startswith(p):
                goal = s[len(p) :].strip()
                goal = re.sub(r"\s+", " ", goal)
                if not goal:
                    return None
                # Keep it short and safe for system prompt injection.
                return goal[:180]
    return None


def build_conversation_contract(
    *,
    primary_intent: str,
    chat_mode: Optional[str],
    character_id: Optional[str],
    has_external_persona: bool,
    explicit_goal: Optional[str],
) -> str:
    """
    Build a compact, product-oriented contract to reduce first-time churn:
    - short, coherent, non-judgmental
    - minimal questions
    - no covert psychological probing

    This is appended as a late policy block inside External Persona System.
    """
    cm = (chat_mode or "").strip().lower()
    cid = (character_id or "").strip().lower()

    lines = ["# Conversation Contract (Core v1)"]

    # Global "first-time retention" rules.
    lines += [
        "- 会話が噛み合わない/外れそうなときは、勝手に決めつけず「事実の確認」を1つだけ行う。",
        "- 1ターンの質問は最大1つ。質問は答えやすい形にする。",
        "- 長文で整えすぎない（目安: 2〜6行）。必要なら要点→次の一手の順に短く。",
        "- ユーザーが明示していない感情・精神状態を推測/決めつけ/掘り下げない（心理分析・診断・ラベリングをしない）。",
        "- 『これは挨拶/調子チェック/分類すると〜』のようなメタ分類説明はしない（AI臭を増やすため）。",
        "- 余計な決め台詞・脈絡のない一言を足さない。必要なら削る。",
    ]

    if explicit_goal:
        lines += ["", "## User-stated goal", f"- {explicit_goal}"]

    # Intent-specific shaping (lightweight).
    intent = (primary_intent or "").strip().upper()
    lines.append("")
    lines.append("## Intent shaping")
    if intent in ("TASK_EXECUTION", "KNOWLEDGE_QA"):
        lines += [
            "- まず結論/手順を短く提示し、不足している前提があれば確認は1つだけ。",
            "- 断定できない場合は『不明点』として短く分け、推測で埋めない。",
        ]
    elif intent in ("SMALL_TALK",):
        lines += [
            "- 雑談は短く返し、会話が続く投げかけは1つまで。",
        ]
    elif intent in ("META_RELATIONSHIP",):
        lines += [
            "- 仕様/挙動の説明は事実ベースで。余計な感情表現や決め台詞はしない。",
        ]
    elif intent in ("EMOTIONAL_SUPPORT", "SELF_DISCLOSURE"):
        lines += [
            "- ユーザーが感情を明示している場合のみ、短い受け止めを1文。",
            "- それ以外は目的/困りごとの事実確認に寄せる（精神状態の探索はしない）。",
        ]
    elif intent in ("SAFETY_CRITICAL",):
        lines += [
            "- 安全上の配慮が必要な場合は、短く拒否/注意喚起し、安全な代替に誘導する。",
        ]
    else:
        lines += ["- 基本は短く・非断定・1質問まで。"]

    # Roleplay nuance: keep flavor but don't sacrifice coherence.
    if has_external_persona or cid:
        lines.append("")
        lines.append("## Roleplay guard")
        lines += [
            "- 口調/世界観は維持してよいが、会話の成立（意図理解・返答の明確さ）を優先する。",
            "- ユーザーの発話を『分析して説明する』形（読心/分類）に寄らない。",
        ]

    # Character-specific: Koishi should avoid non-sequitur "found you" unless triggered.
    if cid in ("koishi", "komeiji_koishi", "komeiji-koishi"):
        lines.append("")
        lines.append("## Character note (koishi)")
        lines += [
            "- 『みつけた』『やっほー』などの出だしは、初回やユーザーの文脈トリガーがある時だけ。",
            "- 哲学・抽象に寄りすぎず、意思疎通が成立する短い問いかけを優先する。",
        ]

    # Chat mode nuance.
    if cm:
        lines.append("")
        lines.append("## Chat mode")
        lines.append(f"- chat_mode={cm}")

    return "\n".join(lines).strip()


def should_apply_contract(md: Dict[str, Any]) -> bool:
    """
    Avoid breaking other apps (e.g., sigmaris-os) by scoping the contract.
    Apply only when external persona injection is in use.
    """
    try:
        ps = md.get("persona_system")
        if isinstance(ps, str) and ps.strip():
            return True
    except Exception:
        pass
    return False

