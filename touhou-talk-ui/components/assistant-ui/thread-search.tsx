"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  // Reset on session switch.
  useEffect(() => {
    setQuery("");
    hitsRef.current = [];
    setHitCount(0);
    setHitIndex(0);
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
    <div className="ml-auto flex min-w-0 items-center gap-2">
      <div className="relative w-56 min-w-0 max-md:w-44 max-sm:w-36">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              e.currentTarget.blur();
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              recomputeHits(query);
              if (e.shiftKey) goPrev();
              else goNext();
            }
          }}
          placeholder={hasSession ? "スレッド内検索" : "検索（未選択）"}
          disabled={!hasSession}
          className="h-9 pr-8 pl-8 text-sm"
          aria-label="スレッド内検索"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted/60"
            aria-label="検索をクリア"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "flex items-center gap-1 text-muted-foreground text-xs",
          !query.trim() && "opacity-0 pointer-events-none max-sm:hidden",
        )}
        aria-hidden={!query.trim()}
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
        <div className="w-14 text-center tabular-nums">{counterLabel}</div>
      </div>
    </div>
  );
}

