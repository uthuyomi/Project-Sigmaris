"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import TopShell from "@/components/top/TopShell";
import EntryLocationAccordion, { type EntryLayerGroup } from "./EntryLocationAccordion";

type SectionId = "hero" | "gensokyo" | "deep" | "higan";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/80 backdrop-blur">
      {children}
    </span>
  );
}

function getScrollRoot(): HTMLElement | null {
  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement)) return null;

  const style = window.getComputedStyle(main);
  const overflowY = style.overflowY;
  const scrollable =
    (overflowY === "auto" || overflowY === "scroll") &&
    main.scrollHeight > main.clientHeight;

  return scrollable ? main : null;
}

function sectionLabel(id: Exclude<SectionId, "hero">) {
  switch (id) {
    case "gensokyo":
      return "幻想郷";
    case "deep":
      return "地底";
    case "higan":
      return "白玉楼";
  }
}

export default function EntryClient({ layers }: { layers: EntryLayerGroup[] }) {
  const [active, setActive] = useState<SectionId>("hero");
  const rafRef = useRef<number | null>(null);

  const backgrounds = useMemo(() => {
    return {
      hero: "/entry/gensoukyou.png",
      gensokyo: "/entry/gensoukyou.png",
      deep: "/entry/titei.png",
      higan: "/entry/hakugyokurou.png",
    } satisfies Record<SectionId, string>;
  }, []);

  useEffect(() => {
    const rootEl = getScrollRoot();
    const rootWindow = !rootEl;

    const getViewportH = () =>
      rootWindow ? window.innerHeight : (rootEl?.clientHeight ?? window.innerHeight);

    const getScrollTop = () => (rootWindow ? window.scrollY : (rootEl?.scrollTop ?? 0));

    const getSectionTop = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      if (rootWindow) return rect.top + window.scrollY;
      const rootRect = rootEl!.getBoundingClientRect();
      return rect.top - rootRect.top + (rootEl?.scrollTop ?? 0);
    };

    const resolveActive = () => {
      const hero = document.getElementById("entry-hero");
      const gensokyo = document.getElementById("entry-layer-gensokyo");
      const deep = document.getElementById("entry-layer-deep");
      const higan = document.getElementById("entry-layer-higan");
      if (!hero || !gensokyo || !deep || !higan) return;

      const vt = getScrollTop();
      const vh = getViewportH();
      const probe = vt + vh * 0.42;

      const candidates: Array<[SectionId, number]> = [
        ["hero", Math.abs(getSectionTop(hero) - probe)],
        ["gensokyo", Math.abs(getSectionTop(gensokyo) - probe)],
        ["deep", Math.abs(getSectionTop(deep) - probe)],
        ["higan", Math.abs(getSectionTop(higan) - probe)],
      ];

      const winner = candidates.reduce((a, b) => (a[1] <= b[1] ? a : b));
      setActive(winner[0]);
    };

    const schedule = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        resolveActive();
      });
    };

    const onScroll = () => schedule();
    const onResize = () => schedule();

    if (rootWindow) window.addEventListener("scroll", onScroll, { passive: true });
    else rootEl!.addEventListener("scroll", onScroll, { passive: true });

    window.addEventListener("resize", onResize, { passive: true });

    resolveActive();
    return () => {
      if (rootWindow) window.removeEventListener("scroll", onScroll);
      else rootEl!.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const order: SectionId[] = ["hero", "gensokyo", "deep", "higan"];
  const activeSrc = backgrounds[active] ?? backgrounds.hero;
  const activeLayer = active === "hero" ? null : active;

  return (
    <TopShell fog scroll backgroundVariant="none">
      {/* fixed background (scroll-linked) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {order.map((id) => {
          const src = backgrounds[id];
          const isActive = src === activeSrc;
          return (
            <div
              key={id}
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
              style={{ backgroundImage: `url(${src})`, opacity: isActive ? 1 : 0 }}
            />
          );
        })}
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/30 to-black/55" />
      </div>

      <div className="relative z-10 w-full max-w-6xl text-white">
        {/* Hero */}
        <section
          id="entry-hero"
          data-entry-section="hero"
          className="mx-auto w-full max-w-6xl rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur sm:p-8"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-gensou text-3xl tracking-wide sm:text-4xl">
                Touhou Talk
              </h1>
              <p className="mt-2 text-sm text-white/70 sm:text-base">
                気になるキャラを選んで、すぐ会話を始めよう。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip>ロケーション別</Chip>
                <Chip>カードで選択</Chip>
                <Chip>ログイン後に開始</Chip>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href="#locations"
                className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-white/90"
              >
                キャラ一覧へ
              </a>
              <Link
                href="/map/session/gensokyo"
                className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white/90 hover:bg-black/45"
              >
                マップ導線へ
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 hover:bg-white/10"
              >
                既存トップへ
              </Link>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/70">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
              背景：{activeLayer ? sectionLabel(activeLayer) : "トップ"}
            </span>
          </div>
        </section>

        {/* Locations */}
        <EntryLocationAccordion layers={layers} />
      </div>
    </TopShell>
  );
}
