"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import TopShell from "@/components/top/TopShell";
import { supabaseBrowser } from "@/lib/supabaseClient";

function safeNextPath(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "/chat/session";
  if (!s.startsWith("/")) return "/chat/session";
  if (s.startsWith("//")) return "/chat/session";
  if (s.includes("://")) return "/chat/session";
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

export default function RequireLoginClient(props: { nextPath?: string | null }) {
  const router = useRouter();
  const nextPath = useMemo(() => safeNextPath(props.nextPath), [props.nextPath]);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const { data } = await supabaseBrowser().auth.getSession();
        if (canceled) return;
        if (data.session) {
          router.replace(nextPath);
          return;
        }
      } catch {
        // ignore
      } finally {
        if (!canceled) setChecking(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [nextPath, router]);

  const loginHref = `/auth/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <TopShell fog>
      <div className="w-full max-w-sm rounded-xl bg-white/10 p-6 backdrop-blur text-white">
        <h1 className="mb-2 text-lg font-medium">ログインが必要です</h1>
        <p className="mb-4 text-sm text-white/80">
          キャラクターチャットを始めるにはログインしてください。
        </p>

        <div className="grid gap-2">
          <Link
            href={loginHref}
            className="w-full rounded-lg bg-white px-4 py-2 text-center text-sm text-black"
          >
            ログインする
          </Link>
          <Link
            href="/entry"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-2 text-center text-sm text-white/90 hover:bg-black/45"
          >
            戻る
          </Link>
        </div>

        {checking ? (
          <div className="mt-4 text-center text-xs text-white/50">確認中…</div>
        ) : null}
      </div>
    </TopShell>
  );
}

