"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { CHARACTERS, type CharacterDef } from "@/data/characters";
import { LOCATIONS, type DeviceType, type LayerId } from "@/lib/map/locations";

type SectionId = "hero" | LayerId;

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/80 backdrop-blur">
      {children}
    </span>
  );
}

function getDeviceType(width: number): DeviceType {
  if (width >= 1024) return "pc";
  if (width >= 768) return "tablet";
  return "sp";
}

function layerLabel(layer: LayerId) {
  switch (layer) {
    case "gensokyo":
      return "幻想郷";
    case "deep":
      return "地底";
    case "higan":
      return "白玉楼";
  }
}

function buildNextPath(ch: CharacterDef) {
  const layer = ch.world?.map ? String(ch.world.map) : "";
  const loc = ch.world?.location ? String(ch.world.location) : "";
  const sp = new URLSearchParams();
  sp.set("char", ch.id);
  if (layer) sp.set("layer", layer);
  if (loc) sp.set("loc", loc);
  return `/chat/session?${sp.toString()}`;
}

function locationNameById(layer: LayerId, locationId: string): string {
  const loc = LOCATIONS.find((l) => l.layer === layer && l.id === locationId);
  return loc?.name ?? locationId;
}

function groupLabelForCharacter(ch: CharacterDef): LayerId | null {
  const layer = ch.world?.map;
  if (layer === "gensokyo" || layer === "deep" || layer === "higan") return layer;
  return null;
}

function charactersByGroup(): Record<LayerId, CharacterDef[]> {
  const out: Record<LayerId, CharacterDef[]> = { gensokyo: [], deep: [], higan: [] };
  for (const ch of Object.values(CHARACTERS)) {
    const g = groupLabelForCharacter(ch);
    if (!g) continue;
    out[g].push(ch);
  }
  for (const layer of ["gensokyo", "deep", "higan"] as const) {
    out[layer].sort((a, b) => {
      const al = String(a.world?.location ?? "");
      const bl = String(b.world?.location ?? "");
      if (al !== bl) return al.localeCompare(bl, "ja");
      return String(a.name).localeCompare(String(b.name), "ja");
    });
  }
  return out;
}

function CharacterCard({
  ch,
  index,
  visible,
}: {
  ch: CharacterDef;
  index: number;
  visible: boolean;
}) {
  const nextPath = buildNextPath(ch);
  const href = `/entry/require-login?next=${encodeURIComponent(nextPath)}`;
  const layer = (ch.world?.map ?? "") as LayerId;
  const locId = typeof ch.world?.location === "string" ? ch.world.location : "";
  const locName = layer && locId ? locationNameById(layer, locId) : "";

  return (
    <Link
      href={href}
      className={[
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left text-white backdrop-blur transition-colors hover:bg-white/10",
        "transition-[opacity,transform] duration-500 ease-out will-change-transform",
        visible ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-4",
      ].join(" ")}
      style={{
        transitionDelay: visible ? `${220 + index * 70}ms` : "0ms",
      }}
    >
      <div className="relative aspect-[4/5] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ch.ui?.avatar ? (
          <img
            src={ch.ui.avatar}
            alt={ch.name}
            className="absolute inset-0 h-full w-full object-cover opacity-95 transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-white/10" />
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/70" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Chip>ロールプレイ</Chip>
          {locName ? <Chip>{locName}</Chip> : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-base font-semibold leading-tight drop-shadow">{ch.name}</div>
          <div className="mt-1 line-clamp-2 text-xs text-white/70 drop-shadow">
            {ch.title}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Chip>チャット</Chip>
            <Chip>ログイン必須</Chip>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function EntryStage() {
  const byGroup = useMemo(() => charactersByGroup(), []);
  const layers: LayerId[] = ["gensokyo", "deep", "higan"];

  const [device, setDevice] = useState<DeviceType>(() =>
    typeof window === "undefined" ? "pc" : getDeviceType(window.innerWidth),
  );
  const [active, setActive] = useState<SectionId>("hero");
  const [cardsVisible, setCardsVisible] = useState<boolean>(false);
  const cardsTimerRef = useRef<number | null>(null);

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
    const sectionIds: Array<[SectionId, string]> = [
      ["hero", "entry-spacer-hero"],
      ["gensokyo", "entry-spacer-gensokyo"],
      ["deep", "entry-spacer-deep"],
      ["higan", "entry-spacer-higan"],
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
        root: null,
        threshold: [0, 0.05, 0.15, 0.35, 0.6],
        rootMargin: "-35% 0px -55% 0px",
      },
    );

    for (const [, el] of els) io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (cardsTimerRef.current) {
      window.clearTimeout(cardsTimerRef.current);
      cardsTimerRef.current = null;
    }

    setCardsVisible(false);

    if (active === "hero") return;

    cardsTimerRef.current = window.setTimeout(() => {
      setCardsVisible(true);
    }, 280);

    return () => {
      if (cardsTimerRef.current) {
        window.clearTimeout(cardsTimerRef.current);
        cardsTimerRef.current = null;
      }
    };
  }, [active]);

  const order: SectionId[] = ["hero", ...layers];
  const activeSrc = backgrounds[active]?.[device] ?? backgrounds.hero[device];

  const currentLayer = active !== "hero" ? active : null;
  const currentCharacters = currentLayer ? byGroup[currentLayer] ?? [] : [];

  return (
    <div className="fixed inset-0 z-20">
      {/* Backgrounds (fixed) */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
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

        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/30 to-black/55" />
      </div>

      {/* Foreground (fixed) */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-6xl text-white">
          {active === "hero" ? (
            <section className="mx-auto w-full max-w-6xl rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur sm:p-8">
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

              <div className="mt-8 flex justify-center">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs text-white/80 backdrop-blur">
                  <span>スクロールしてキャラを選ぶ</span>
                  <span className="relative inline-flex h-8 w-5 items-start justify-center rounded-full border border-white/25">
                    <span className="mt-2 block h-1 w-1 rounded-full bg-white/80 motion-safe:animate-bounce" />
                  </span>
                </div>
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <div className="text-xs font-medium text-white/80">
                  {layerLabel(active as LayerId)}
                </div>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {currentCharacters.map((ch, idx) => (
                  <CharacterCard key={ch.id} ch={ch} index={idx} visible={cardsVisible} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
