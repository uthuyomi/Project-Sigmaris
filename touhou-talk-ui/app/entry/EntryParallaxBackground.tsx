"use client";

import { useEffect, useMemo, useState } from "react";

import { MAP_BACKGROUNDS, type DeviceType, type LayerId } from "@/lib/map/locations";

type SectionId = "hero" | LayerId;

function getDeviceType(width: number): DeviceType {
  if (width >= 1024) return "pc";
  if (width >= 768) return "tablet";
  return "sp";
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export default function EntryParallaxBackground() {
  const [device, setDevice] = useState<DeviceType>(() =>
    typeof window === "undefined" ? "pc" : getDeviceType(window.innerWidth),
  );
  const [active, setActive] = useState<SectionId>("hero");
  const [parallaxY, setParallaxY] = useState<number>(0);

  useEffect(() => {
    const onResize = () => setDevice(getDeviceType(window.innerWidth));
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const backgrounds = useMemo(() => {
    const heroBg: Record<DeviceType, string> = {
      pc: "/maps/base-pc.png",
      tablet: "/maps/base-pc.png",
      sp: "/maps/base-pc.png",
    };
    return {
      hero: heroBg,
      gensokyo: MAP_BACKGROUNDS.gensokyo,
      deep: MAP_BACKGROUNDS.deep,
      higan: MAP_BACKGROUNDS.higan,
    } satisfies Record<SectionId, Record<DeviceType, string>>;
  }, []);

  useEffect(() => {
    const root = document.querySelector("main") as HTMLElement | null;
    if (!root) return;

    const sectionIds: Array<[SectionId, string]> = [
      ["hero", "entry-hero"],
      ["gensokyo", "entry-gensokyo"],
      ["deep", "entry-deep"],
      ["higan", "entry-higan"],
    ];
    const els = sectionIds
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

  useEffect(() => {
    const root = document.querySelector("main") as HTMLElement | null;
    if (!root) return;
    if (prefersReducedMotion()) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const y = root.scrollTop * 0.12;
      setParallaxY(y);
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const order: SectionId[] = ["hero", "gensokyo", "deep", "higan"];
  const activeSrc = backgrounds[active]?.[device] ?? backgrounds.hero[device];

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0 will-change-transform"
        style={{ transform: `translate3d(0, ${-parallaxY}px, 0) scale(1.06)` }}
      >
        {order.map((id) => {
          const src = backgrounds[id]?.[device];
          if (!src) return null;
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
    </div>
  );
}

