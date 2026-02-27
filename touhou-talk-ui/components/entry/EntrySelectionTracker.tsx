"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

const KEY = "touhou:last_selected_chat_next";

function safeNextPath(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) return "";
  if (s.startsWith("//")) return "";
  if (s.includes("://")) return "";
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

function tryStoreNextFromHref(href: string) {
  try {
    // /entry/require-login?next=...
    const u = new URL(href, window.location.origin);
    if (u.pathname === "/entry/require-login") {
      const next = safeNextPath(u.searchParams.get("next"));
      if (next) localStorage.setItem(KEY, next);
      return;
    }

    // /auth/login?next=...
    if (u.pathname === "/auth/login") {
      const next = safeNextPath(u.searchParams.get("next"));
      if (next) localStorage.setItem(KEY, next);
      return;
    }

    // /chat/session?... (already the destination)
    if (u.pathname === "/chat/session") {
      const next = safeNextPath(u.pathname + u.search);
      if (next) localStorage.setItem(KEY, next);
      return;
    }
  } catch {
    // ignore
  }
}

export function getLastSelectedChatNext(): string {
  try {
    return safeNextPath(localStorage.getItem(KEY));
  } catch {
    return "";
  }
}

export function setLastSelectedChatNext(next: string) {
  try {
    const s = safeNextPath(next);
    if (s) localStorage.setItem(KEY, s);
  } catch {
    // ignore
  }
}

export default function EntrySelectionTracker(props: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const t = e.target as HTMLElement | null;
    const a = t?.closest?.("a") as HTMLAnchorElement | null;
    const href = a?.getAttribute("href");
    if (!href) return;

    tryStoreNextFromHref(href);

    // /entry/require-login の中継（ログイン確認）を使わず、直接 /auth/login に送る
    try {
      const u = new URL(href, window.location.origin);
      if (u.pathname === "/entry/require-login") {
        const next = safeNextPath(u.searchParams.get("next"));
        e.preventDefault();
        router.push(`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
      }
    } catch {
      // ignore
    }
  }, [router]);

  return <div onClickCapture={onClickCapture}>{props.children}</div>;
}
