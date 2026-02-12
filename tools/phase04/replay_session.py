from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from persona_core.storage.env_loader import load_dotenv
from persona_core.storage.supabase_rest import SupabaseConfig, SupabaseRESTClient
from persona_core.storage.supabase_store import SupabasePersonaDB
from persona_core.phase04.kernel import Kernel


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_uuid(s: str) -> bool:
    try:
        uuid.UUID(str(s))
        return True
    except Exception:
        return False


def _load_snapshot_state(db: SupabasePersonaDB, *, snapshot_id: str) -> Optional[Dict[str, Any]]:
    rows = db._c.select(  # noqa: SLF001 (tooling-only script)
        "common_kernel_snapshots",
        columns="snapshot_id,state,created_at",
        filters=[f"snapshot_id=eq.{snapshot_id}"],
        limit=1,
    )
    if not rows or not isinstance(rows, list):
        return None
    row = rows[0] if isinstance(rows[0], dict) else None
    if not row:
        return None
    st = row.get("state")
    return st if isinstance(st, dict) else None


def _apply_deltas(kernel: Kernel, *, user_id: str, deltas: List[Dict[str, Any]]) -> Tuple[int, List[Dict[str, Any]]]:
    applied = 0
    errors: List[Dict[str, Any]] = []
    for d in deltas or []:
        if not isinstance(d, dict):
            continue
        res = kernel.apply_delta(
            user_id=user_id,
            target_category=str(d.get("target_category") or ""),
            key=str(d.get("key") or ""),
            operation_type=str(d.get("operation_type") or ""),
            delta_value=d.get("delta_value"),
        )
        if res.get("ok"):
            applied += 1
        else:
            errors.append({"delta": d, "error": res.get("error")})
    return applied, errors


def main(argv: List[str]) -> int:
    load_dotenv(override=False)

    ap = argparse.ArgumentParser(description="Replay Phase04 kernel deltas from Supabase logs.")
    ap.add_argument("--user-id", required=True, help="Supabase auth uid (uuid)")
    ap.add_argument("--session-id", required=True, help="session_id used by the UI/core")
    ap.add_argument("--max-turns", type=int, default=200, help="limit number of delta-log rows")
    ap.add_argument("--print-io", action="store_true", help="also show recent io events for the session")
    args = ap.parse_args(argv)

    user_id = str(args.user_id)
    session_id = str(args.session_id)
    if not _is_uuid(user_id):
        print("user-id must be a uuid (Supabase auth uid)", file=sys.stderr)
        return 2

    cfg = SupabaseConfig.from_env()
    if cfg is None:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured", file=sys.stderr)
        return 2

    c = SupabaseRESTClient(cfg)
    db = SupabasePersonaDB(c)

    # Load delta logs for the session (chronological)
    logs = c.select(
        "common_kernel_delta_logs",
        columns="id,created_at,decision,approved_deltas,trace_id",
        filters=[f"user_id=eq.{user_id}", f"session_id=eq.{session_id}"],
        order="created_at.asc",
        limit=int(max(1, args.max_turns)),
    )
    if not isinstance(logs, list):
        print("unexpected response from common_kernel_delta_logs", file=sys.stderr)
        return 2

    kernel = Kernel()
    replay_user = user_id

    verified = 0
    failed = 0

    for row in logs:
        if not isinstance(row, dict):
            continue
        decision = row.get("decision") if isinstance(row.get("decision"), dict) else {}
        approved = row.get("approved_deltas") if isinstance(row.get("approved_deltas"), list) else []

        snap_before_id = str(decision.get("notes", {}).get("kernel_snapshot_before_id") or "") if isinstance(decision.get("notes"), dict) else ""
        snap_after_id = str(decision.get("notes", {}).get("kernel_snapshot_after_id") or "") if isinstance(decision.get("notes"), dict) else ""
        hash_before = str(decision.get("notes", {}).get("kernel_state_hash_before") or "") if isinstance(decision.get("notes"), dict) else ""
        hash_after = str(decision.get("notes", {}).get("kernel_state_hash_after") or "") if isinstance(decision.get("notes"), dict) else ""

        if snap_before_id:
            st = _load_snapshot_state(db, snapshot_id=snap_before_id)
            if st is not None:
                kernel.set_state(user_id=replay_user, state=st)

        got_before = kernel.state_sha256(user_id=replay_user)
        if hash_before and got_before != hash_before:
            failed += 1
            print(
                json.dumps(
                    {
                        "ok": False,
                        "kind": "hash_mismatch_before",
                        "created_at": row.get("created_at"),
                        "trace_id": row.get("trace_id"),
                        "expected": hash_before,
                        "got": got_before,
                    },
                    ensure_ascii=False,
                )
            )
            continue

        applied, errors = _apply_deltas(kernel, user_id=replay_user, deltas=approved)  # noqa: F841
        got_after = kernel.state_sha256(user_id=replay_user)

        if hash_after and got_after != hash_after:
            failed += 1
            print(
                json.dumps(
                    {
                        "ok": False,
                        "kind": "hash_mismatch_after",
                        "created_at": row.get("created_at"),
                        "trace_id": row.get("trace_id"),
                        "expected": hash_after,
                        "got": got_after,
                        "errors": errors,
                        "snapshot_after_id": snap_after_id or None,
                    },
                    ensure_ascii=False,
                )
            )
            continue

        verified += 1

    if args.print_io:
        io_rows = c.select(
            "common_io_events",
            columns="created_at,event_type,ok,error,source_urls,cache_key,trace_id",
            filters=[f"user_id=eq.{user_id}", f"session_id=eq.{session_id}"],
            order="created_at.desc",
            limit=50,
        )
        if isinstance(io_rows, list):
            print(json.dumps({"io_events": io_rows, "generated_at": _iso_now()}, ensure_ascii=False))

    print(json.dumps({"ok": True, "verified": verified, "failed": failed, "generated_at": _iso_now()}, ensure_ascii=False))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
