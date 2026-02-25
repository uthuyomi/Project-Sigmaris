"use client";

import { useEffect, useMemo, useState } from "react";

type SectionId = "hero" | "gensokyo" | "deep" | "higan";

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

export default function EntryScrollBackground() {
  const [active, setActive] = useState<SectionId>("hero");

  const backgrounds = useMemo(() => {
    return {
      hero: "/entry/gensoukyou.png",
      gensokyo: "/entry/gensoukyou.png",
      deep: "/entry/titei.png",
      higan: "/entry/hakugyokurou.png",
    } satisfies Record<SectionId, string>;
  }, []);

  useEffect(() => {
    const root = getScrollRoot();

    const targets: Array<[SectionId, string]> = [
      ["hero", "entry-hero"],
      ["gensokyo", "entry-layer-gensokyo"],
      ["deep", "entry-layer-deep"],
      ["higan", "entry-layer-higan"],
    ];

    const els = targets
      .map(([id, domId]) => [id, document.getElementById(domId)] as const)
      .filter((x): x is readonly [SectionId, HTMLElement] => Boolean(x[1]));

    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;

        const winner = visible.reduce((a, b) =>
          (a.intersectionRatio ?? 0) >= (b.intersectionRatio ?? 0) ? a : b,
        );
        const id = (winner.target as HTMLElement).dataset.entrySection as SectionId | undefined;
        if (id) setActive(id);
      },
      {
        root,
        threshold: [0, 0.05, 0.15, 0.35, 0.6],
        rootMargin: "-35% 0px -55% 0px",
      },
    );

    for (const [, el] of els) io.observe(el);
    return () => io.disconnect();
  }, []);

  const order: SectionId[] = ["hero", "gensokyo", "deep", "higan"];
  const activeSrc = backgrounds[active] ?? backgrounds.hero;

  return (
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

      {/* readability overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/30 to-black/55" />
    </div>
  );
}

