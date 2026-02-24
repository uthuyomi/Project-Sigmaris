"use client";

import { useEffect, useMemo, useState } from "react";

import type { DeviceType, LayerId } from "@/lib/map/locations";

type SectionId = "hero" | LayerId;

function getDeviceType(width: number): DeviceType {
  if (width >= 1024) return "pc";
  if (width >= 768) return "tablet";
  return "sp";
}

export default function EntryParallaxBackground() {
  const [device, setDevice] = useState<DeviceType>(() =>
    typeof window === "undefined" ? "pc" : getDeviceType(window.innerWidth),
  );
  const [active, setActive] = useState<SectionId>("hero");

  useEffect(() => {
    const onResize = () => setDevice(getDeviceType(window.innerWidth));
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const backgrounds = useMemo(() => {
    const heroBg: Record<DeviceType, string> = {
      pc: "/entry/gensoukyou.png",
      tablet: "/entry/gensoukyou.png",
      sp: "/entry/gensoukyou.png",
    };
    return {
      hero: heroBg,
      gensokyo: {
        pc: "/entry/gensoukyou.png",
        tablet: "/entry/gensoukyou.png",
        sp: "/entry/gensoukyou.png",
      },
      deep: {
        pc: "/entry/titei.png",
        tablet: "/entry/titei.png",
        sp: "/entry/titei.png",
      },
      higan: {
        pc: "/entry/hakugyokurou.png",
        tablet: "/entry/hakugyokurou.png",
        sp: "/entry/hakugyokurou.png",
      },
    } satisfies Record<SectionId, Record<DeviceType, string>>;
  }, []);

  const fallbacks = useMemo(() => {
    return {
      hero: {
        pc: "/maps/base-pc.png",
        tablet: "/maps/base-pc.png",
        sp: "/maps/base-pc.png",
      },
      gensokyo: {
        pc: "/maps/gensokyo-pc.png",
        tablet: "/maps/gensokyo-sp.png",
        sp: "/maps/gensokyo-sp.png",
      },
      deep: {
        pc: "/maps/deep-pc.png",
        tablet: "/maps/deep-sp.png",
        sp: "/maps/deep-sp.png",
      },
      higan: {
        pc: "/maps/higan-pc.png",
        tablet: "/maps/higan-sp.png",
        sp: "/maps/higan-sp.png",
      },
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

  const order: SectionId[] = ["hero", "gensokyo", "deep", "higan"];
  const activeSrc = backgrounds[active]?.[device] ?? backgrounds.hero[device];

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {order.map((id) => {
        const src = backgrounds[id]?.[device];
        const fallback = fallbacks[id]?.[device];
        if (!src || !fallback) return null;
        const isActive = src === activeSrc;
        return (
          <div
            key={id}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
            style={{
              backgroundImage: `url(${src}), url(${fallback})`,
              opacity: isActive ? 1 : 0,
            }}
          />
        );
      })}

      {/* readability overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/30 to-black/55" />
    </div>
  );
}
