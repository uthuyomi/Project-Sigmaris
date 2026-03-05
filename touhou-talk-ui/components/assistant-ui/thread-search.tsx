"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Hit = {
  root: HTMLElement;
  highlightEl: HTMLElement;
  text: string;
};

function getThreadViewport(): HTMLElement | null {
  return document.querySelector(".aui-thread-viewport");
}

function findMessageRoots(viewport: HTMLElement): HTMLElement[] {
  return Array.from(
    viewport.querySelectorAll<HTMLElement>(
      '[data-role="user"], [data-role="assistant"]',
    ),
  );
}

function getHighlightEl(root: HTMLElement): HTMLElement {
  const bubble = root.querySelector<HTMLElement>(
    ".aui-user-message-content, .aui-assistant-message-content",
  );
  return bubble ?? root;
}

function normalizeForSearch(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function collectHits(query: string): Hit[] {
  const q = normalizeForSearch(query);
  if (!q) return [];

  const viewport = getThreadViewport();
  if (!viewport) return [];

  const roots = findMessageRoots(viewport);
  const hits: Hit[] = [];
  for (const root of roots) {
    const highlightEl = getHighlightEl(root);
    const text = normalizeForSearch(highlightEl.innerText || root.innerText || "");
    if (!text) continue;
    if (!text.includes(q)) continue;
    hits.push({ root, highlightEl, text });
  }
  return hits;
}

function flashHighlight(el: HTMLElement) {
  const prevBoxShadow = el.style.boxShadow;
  const prevOutline = el.style.outline;
  const prevOutlineOffset = el.style.outlineOffset;

  // Scroll offset safety (sticky header)
  el.style.scrollMarginTop = "5rem";

  el.style.outline = "2px solid rgba(56, 189, 248, 0.9)";
  el.style.outlineOffset = "6px";
  el.style.boxShadow =
    "0 0 0 3px rgba(56, 189, 248, 0.25), 0 0 40px rgba(56, 189, 248, 0.22)";

  window.setTimeout(() => {
    el.style.boxShadow = prevBoxShadow;
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOutlineOffset;
  }, 900);
}

export function ThreadSearch(props: { activeSessionId: string | null }) {
  const { activeSessionId } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hitCount, setHitCount] = useState(0);
  const [hitIndex, setHitIndex] = useState(0);
  const hitsRef = useRef<Hit[]>([]);

  const hasSession = Boolean(activeSessionId);

  const counterLabel = useMemo(() => {
    if (!query.trim()) return "";
    if (hitCount <= 0) return "0/0";
    const idx = Math.min(Math.max(hitIndex, 0), hitCount - 1);
    return `${idx + 1}/${hitCount}`;
  }, [hitCount, hitIndex, query]);

  const recomputeHits = useCallback(
    (q: string) => {
      if (!hasSession) {
        hitsRef.current = [];
        setHitCount(0);
        setHitIndex(0);
        return;
      }

      const hits = collectHits(q);
      hitsRef.current = hits;
      setHitCount(hits.length);
      setHitIndex((prev) => {
        if (hits.length <= 0) return 0;
        return Math.min(Math.max(prev, 0), hits.length - 1);
      });
    },
    [hasSession],
  );

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 160;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, []);

  // Reset on session switch.
  useEffect(() => {
    setQuery("");
    hitsRef.current = [];
    setHitCount(0);
    setHitIndex(0);
    setOpen(false);
  }, [activeSessionId]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      hitsRef.current = [];
      setHitCount(0);
      setHitIndex(0);
      return;
    }

    const handle = window.setTimeout(() => recomputeHits(query), 150);
    return () => window.clearTimeout(handle);
  }, [query, recomputeHits]);

  // Auto-resize the textarea while open.
  useEffect(() => {
    if (!open) return;
    resizeTextarea();
  }, [open, query, resizeTextarea]);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (!root.contains(target)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const goTo = useCallback((idx: number) => {
    const hits = hitsRef.current;
    if (!hits.length) return;
    const clamped = Math.min(Math.max(idx, 0), hits.length - 1);
    const hit = hits[clamped];
    setHitIndex(clamped);
    hit.root.scrollIntoView({ behavior: "smooth", block: "center" });
    flashHighlight(hit.highlightEl);
  }, []);

  const goPrev = useCallback(() => {
    if (hitCount <= 0) return;
    const next = hitIndex - 1 < 0 ? hitCount - 1 : hitIndex - 1;
    goTo(next);
  }, [goTo, hitCount, hitIndex]);

  const goNext = useCallback(() => {
    if (hitCount <= 0) return;
    const next = hitIndex + 1 >= hitCount ? 0 : hitIndex + 1;
    goTo(next);
  }, [goTo, hitCount, hitIndex]);

  return (
    <div
      ref={rootRef}
      className="ml-auto flex items-center justify-end"
      data-open={open ? "true" : "false"}
    >
      <div className="relative">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "rounded-full",
            open && "bg-muted-foreground/15 hover:bg-muted-foreground/20",
          )}
          onClick={() => {
            if (!hasSession) return;
            setOpen((v) => !v);
            window.setTimeout(() => textareaRef.current?.focus(), 0);
          }}
          disabled={!hasSession}
          aria-label="スレッド内検索を開く"
        >
          <SearchIcon className="size-4" />
        </Button>

        {open ? (
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(520px,calc(100vw-2rem))] rounded-xl border bg-background/90 p-3 shadow-lg backdrop-blur">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <textarea
                  ref={textareaRef}
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if ((e.nativeEvent as unknown as { isComposing?: boolean })?.isComposing) return;
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setOpen(false);
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      recomputeHits(query);
                      if (e.shiftKey) goPrev();
                      else goNext();
                    }
                  }}
                  placeholder="スレッド内検索（Enterで次 / Shift+Enterで前）"
                  className={cn(
                    "w-full resize-none rounded-lg border border-input bg-background/70 px-3 py-2 text-sm text-foreground shadow-xs outline-none",
                    "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  )}
                  rows={1}
                  aria-label="スレッド内検索"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {query.trim() ? counterLabel : ""}
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1",
                      !query.trim() && "opacity-50",
                    )}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={goPrev}
                      disabled={hitCount <= 0}
                      aria-label="前の一致へ"
                    >
                      <ChevronUpIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={goNext}
                      disabled={hitCount <= 0}
                      aria-label="次の一致へ"
                    >
                      <ChevronDownIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 rounded-full"
                onClick={() => {
                  setQuery("");
                  setHitCount(0);
                  setHitIndex(0);
                  hitsRef.current = [];
                  textareaRef.current?.focus();
                }}
                aria-label="検索をクリア"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
