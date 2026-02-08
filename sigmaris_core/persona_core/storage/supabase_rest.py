from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


class SupabaseRESTError(RuntimeError):
    pass


def _env(name: str) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return None
    v = v.strip()
    return v or None


@dataclass
class SupabaseConfig:
    url: str
    service_role_key: str
    schema: str = "public"

    @staticmethod
    def from_env() -> Optional["SupabaseConfig"]:
        url = _env("SUPABASE_URL")
        key = _env("SUPABASE_SERVICE_ROLE_KEY")
        schema = _env("SUPABASE_SCHEMA") or "public"
        if not url or not key:
            return None
        return SupabaseConfig(url=url, service_role_key=key, schema=schema)


class SupabaseRESTClient:
    """
    Supabase PostgREST client (依存なし / urllib版)

    前提:
    - サーバ側で `SUPABASE_SERVICE_ROLE_KEY` を使って書き込む（RLS回避）。
    """

    def __init__(self, config: SupabaseConfig, *, timeout_sec: int = 30) -> None:
        self._cfg = config
        self._timeout = int(timeout_sec)

    def _make_url(self, path: str, query: Optional[Dict[str, str]] = None) -> str:
        base = self._cfg.url.rstrip("/")
        url = base + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        return url

    def _headers(self) -> Dict[str, str]:
        # service role key を bearer として利用
        return {
            "apikey": self._cfg.service_role_key,
            "Authorization": f"Bearer {self._cfg.service_role_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "return=representation",
        }

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Dict[str, str]] = None,
        json_body: Optional[Any] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Tuple[int, Any]:
        url = self._make_url(path, query=query)
        data: Optional[bytes]
        if json_body is None:
            data = None
        else:
            data = json.dumps(json_body, ensure_ascii=False).encode("utf-8")

        headers = self._headers()
        headers["Accept-Profile"] = self._cfg.schema
        headers["Content-Profile"] = self._cfg.schema
        if extra_headers:
            headers.update(extra_headers)

        req = urllib.request.Request(url=url, method=method.upper(), data=data, headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read()
                status = int(resp.status)
        except urllib.error.HTTPError as e:
            raw = e.read()
            status = int(getattr(e, "code", 0) or 0)
        except Exception as e:
            raise SupabaseRESTError(f"Supabase REST request failed: {e}") from e

        if not raw:
            return status, None

        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            payload = raw.decode("utf-8", errors="replace")

        if status >= 400:
            raise SupabaseRESTError(f"Supabase REST HTTP {status}: {payload}")

        return status, payload

    # --------------------------
    # Convenience
    # --------------------------

    def insert(self, table: str, row: Dict[str, Any]) -> Any:
        _, payload = self.request("POST", f"/rest/v1/{table}", json_body=row)
        return payload

    def upsert(self, table: str, row: Dict[str, Any], *, on_conflict: str) -> Any:
        _, payload = self.request(
            "POST",
            f"/rest/v1/{table}",
            query={"on_conflict": on_conflict},
            json_body=row,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )
        return payload

    def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: Optional[List[str]] = None,
        order: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> Any:
        q: Dict[str, str] = {"select": columns}
        if order:
            q["order"] = order
        if limit is not None:
            q["limit"] = str(int(limit))

        path = f"/rest/v1/{table}"
        if filters:
            # PostgREST は querystring にフィルタを並べる
            # 例: user_id=eq.xxx
            for f in filters:
                k, v = f.split("=", 1)
                q[k] = v

        _, payload = self.request("GET", path, query=q)
        return payload

