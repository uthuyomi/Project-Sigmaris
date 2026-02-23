"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useButton } from "@react-aria/button";
import { motion } from "framer-motion";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { CHARACTERS, type CharacterDef } from "@/data/characters";
import type { DeviceType, LayerId, MapLocation } from "@/lib/map/locations";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Size = { width: number; height: number };

type BackgroundSrc = {
  sp: string;
  tablet: string;
  pc: string;
};

type Props = {
  layer: LayerId;
  backgroundSrc: BackgroundSrc;
  locations: MapLocation[];
};

function useDevice(): DeviceType {
  const [device, setDevice] = useState<DeviceType>("pc");

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w <= 640) setDevice("sp");
      else if (w <= 1024) setDevice("tablet");
      else setDevice("pc");
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return device;
}

function useElementSize<T extends HTMLElement>(ref: RefObject<T>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

function computeContainTransform(container: Size, natural: Size) {
  const scale = Math.min(
    container.width / natural.width,
    container.height / natural.height,
  );

  const x = (container.width - natural.width * scale) / 2;
  const y = (container.height - natural.height * scale) / 2;

  return { x, y, scale };
}

function labelByLayer(layer: LayerId) {
  switch (layer) {
    case "gensokyo":
      return "Layer1：幻想郷";
    case "deep":
      return "Layer2：地底";
    case "higan":
      return "Layer3：彼岸";
  }
}

function titleByLayer(layer: LayerId) {
  switch (layer) {
    case "gensokyo":
      return "幻想郷";
    case "deep":
      return "地底";
    case "higan":
      return "彼岸";
  }
}

function LayerPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-[color:var(--map-accent-soft)] bg-[color:var(--map-accent-weak)] text-white"
          : "border-white/10 bg-black/25 text-white/80 hover:bg-black/45 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function CharacterAvatar({
  character,
  size,
}: {
  character: CharacterDef;
  size: "sm" | "md";
}) {
  const pixel = size === "md" ? "h-16 w-16" : "h-12 w-12";
  const border = "border-[color:var(--map-accent-soft)]";
  const shadow = "shadow-[0_0_18px_var(--map-accent-strong)]";

  if (typeof character.ui?.avatar === "string" && character.ui.avatar.trim()) {
    return (
      <img
        src={character.ui.avatar}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={`${pixel} shrink-0 rounded-2xl border ${border} bg-black/40 object-cover ${shadow}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${pixel} shrink-0 rounded-2xl border border-white/10 bg-black/40`}
    />
  );
}

function LocationPin({
  location,
  position,
  isActive,
  onSelect,
}: {
  location: MapLocation;
  position: { x: number; y: number };
  isActive: boolean;
  onSelect: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { buttonProps, isPressed } = useButton(
    {
      onPress: onSelect,
      elementType: "button",
      "aria-label": `${location.name} を選択`,
    },
    buttonRef,
  );
  const {
    onDrag: _onDrag,
    onDragStart: _onDragStart,
    onDragEnd: _onDragEnd,
    onDragEnter: _onDragEnter,
    onDragLeave: _onDragLeave,
    onDragOver: _onDragOver,
    onDrop: _onDrop,
    onAnimationStart: _onAnimationStart,
    onAnimationEnd: _onAnimationEnd,
    onAnimationIteration: _onAnimationIteration,
    ...safeButtonProps
  } = buttonProps;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          {...safeButtonProps}
          ref={buttonRef}
          type="button"
          aria-pressed={isActive}
          data-pressed={isPressed ? "true" : "false"}
          className="map-pin group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--map-marker)] focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
        >
          {/* Hit area (bigger than visuals) */}
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full" />

          {/* Ground projection */}
          <span
            className={[
              "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
              isActive ? "h-16 w-16 opacity-95" : "h-14 w-14 opacity-60",
            ].join(" ")}
            style={{
              background:
                "radial-gradient(circle at center, var(--map-marker-strong) 0%, transparent 65%)",
              filter: "blur(0.4px)",
            }}
          />

          {/* Beam */}
          <span
            className={[
              "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[110%] origin-bottom rounded-full",
              isActive
                ? "h-28 w-10 opacity-100 animate-[beacon-pulse_1.15s_ease-in-out_infinite]"
                : "h-20 w-6 opacity-45 group-hover:opacity-70 group-focus-visible:opacity-70",
            ].join(" ")}
            style={{
              background:
                "linear-gradient(to top, transparent 0%, var(--map-marker-glow) 40%, transparent 100%)",
              boxShadow: "0 0 28px var(--map-marker-strong)",
            }}
          />

          {/* Hex base */}
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-[beacon-float_2.6s_ease-in-out_infinite]">
            <span
              className={[
                "block h-10 w-11",
                isActive
                  ? "shadow-[0_0_24px_var(--map-marker-glow)]"
                  : "shadow-[0_0_18px_var(--map-marker-strong)]",
              ].join(" ")}
              style={{
                clipPath:
                  "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
                background:
                  "linear-gradient(180deg, var(--map-marker-soft), var(--map-marker-weak))",
                border: "1px solid var(--map-marker-soft)",
              }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: "var(--map-marker)",
                boxShadow: "0 0 18px var(--map-marker-glow)",
              }}
            />
          </span>

          {/* Label */}
          <span
            className={[
              "pointer-events-none mt-3 block whitespace-nowrap rounded-xl border px-3 py-1.5 text-base backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.35)]",
              isActive
                ? "border-[color:var(--map-marker-soft)] bg-black/65 text-white"
                : "border-white/10 bg-black/50 text-white/90 group-hover:bg-black/70 group-focus-visible:bg-black/70",
            ].join(" ")}
          >
            {location.name}
          </span>
        </motion.button>
      </TooltipTrigger>

      <TooltipContent side="top" sideOffset={10}>
        クリック/タップで選択
      </TooltipContent>
    </Tooltip>
  );
}

export default function WorldMap({ layer, backgroundSrc, locations }: Props) {
  const device = useDevice();
  const mapSrc = backgroundSrc[device];
  const router = useRouter();

  const containerRef = useRef<HTMLDivElement>(null);
  const containerSize = useElementSize(containerRef);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const layerPanelRef = useRef<HTMLDivElement>(null);
  const layerPanelSize = useElementSize(layerPanelRef);

  const [naturalSize, setNaturalSize] = useState<Size>({ width: 0, height: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingChar, setLoadingChar] = useState<string | null>(null);

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
  }, [mapSrc]);

  useEffect(() => {
    const api = transformRef.current;
    if (!api) return;
    if (
      containerSize.width <= 0 ||
      containerSize.height <= 0 ||
      naturalSize.width <= 0 ||
      naturalSize.height <= 0
    ) {
      return;
    }

    const headerOffset =
      device === "pc" && layerPanelSize.height > 0
        ? Math.min(containerSize.height, layerPanelSize.height + 24)
        : 0;

    const visible = {
      width: containerSize.width,
      height: Math.max(1, containerSize.height - headerOffset),
    };

    const base = computeContainTransform(visible, naturalSize);
    const x = base.x;
    const y = base.y + headerOffset;
    const scale = base.scale;
    api.setTransform(x, y, scale, 0);
  }, [containerSize, naturalSize, device, layerPanelSize.height]);

  const active = useMemo(
    () => locations.find((l) => l.id === activeId) ?? null,
    [activeId, locations],
  );

  const characters = useMemo(
    () => Object.values(CHARACTERS) as CharacterDef[],
    [],
  );

  const charactersByLocation = useMemo(() => {
    const map = new Map<string, CharacterDef[]>();
    for (const c of characters) {
      if (c.world?.map !== layer) continue;
      const locId = c.world.location;
      const list = map.get(locId);
      if (list) list.push(c);
      else map.set(locId, [c]);
    }
    return map;
  }, [characters, layer]);

  const hasAnyCharacterInLayer = (targetLayer: LayerId): boolean =>
    characters.some((c) => c.world?.map === targetLayer);

  const charactersHere = useMemo(() => {
    if (!active) return [];
    return charactersByLocation.get(active.id) ?? [];
  }, [active, charactersByLocation]);

  const openCharacterChat = (char: CharacterDef) => {
    setLoadingChar(char.id);

    const params = new URLSearchParams();
    params.set("layer", layer);
    if (active?.id) params.set("loc", active.id);
    params.set("char", char.id);

    router.push(`/chat/session?${params.toString()}`);
  };

  const hint = "マップ上の地点を選択";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-slate-900 touch-none"
    >
      {/* base background */}
      <img
        src="/maps/base-pc.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 select-none object-cover blur-[1px] opacity-70 brightness-110 contrast-125 saturate-110"
      />

      {/* blurred map background */}
      <img
        src={mapSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 select-none object-cover blur-2xl opacity-25 brightness-110"
      />

      <div className="pointer-events-none absolute inset-0 bg-black/5" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.10)_0%,rgba(0,0,0,0.38)_70%,rgba(0,0,0,0.65)_100%)]" />

      {/* HUD frame */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:48px_48px] opacity-20" />
      </div>

      <TooltipProvider delayDuration={150}>
        <div className="absolute inset-0 z-10">
          <TransformWrapper
            ref={transformRef}
            minScale={0.2}
            maxScale={4}
            limitToBounds={false}
            centerOnInit={false}
            wheel={{ step: 0.08 }}
            pinch={{ step: 5 }}
            panning={{ excluded: ["map-ui", "map-pin"] }}
          >
          <TransformComponent
            wrapperClass="!w-full !h-full"
            contentClass="flex items-center justify-center"
          >
            <div
              className="relative select-none"
              style={{
                width: naturalSize.width > 0 ? naturalSize.width : 1,
                height: naturalSize.height > 0 ? naturalSize.height : 1,
              }}
            >
              <img
                src={mapSrc}
                alt={`${layer} map`}
                draggable={false}
                className="block h-full w-full select-none brightness-105"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setNaturalSize({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                  });
                }}
              />

              {locations.map((loc) => {
                const pos = loc.pos[device] ?? loc.pos.pc;
                const charactersAtLocation =
                  charactersByLocation.get(loc.id) ?? [];
                if (charactersAtLocation.length === 0) return null;

                return (
                  <LocationPin
                    key={loc.id}
                    location={loc}
                    position={pos}
                    isActive={activeId === loc.id}
                    onSelect={() => setActiveId(loc.id)}
                  />
                );
              })}
            </div>
          </TransformComponent>

          {/* Layer panel */}
          <div className="map-ui pointer-events-auto absolute left-1/2 top-4 z-30 -translate-x-1/2 touch-auto">
            <div
              ref={layerPanelRef}
              className="w-[520px] max-w-[94vw] rounded-2xl border border-[color:var(--map-accent-weak)] bg-black/45 px-4 py-3 text-white backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
            >
              <div className="mt-1 text-center font-gensou text-2xl tracking-[0.16em] drop-shadow-[0_2px_14px_var(--map-accent-strong)]">
                {titleByLayer(layer)}
              </div>

              <div className="mt-3 flex justify-center gap-2">
                {hasAnyCharacterInLayer("gensokyo") && (
                  <LayerPill
                    href="/map/session/gensokyo"
                    label="幻想郷"
                    active={layer === "gensokyo"}
                  />
                )}
                {hasAnyCharacterInLayer("deep") && (
                  <LayerPill
                    href="/map/session/deep"
                    label="地底"
                    active={layer === "deep"}
                  />
                )}
                {hasAnyCharacterInLayer("higan") && (
                  <LayerPill
                    href="/map/session/higan"
                    label="彼岸"
                    active={layer === "higan"}
                  />
                )}
              </div>
            </div>
          </div>

          {/* A: Desktop drawer (PC) */}
          {active ? (
            <div className="map-ui pointer-events-auto hidden lg:block absolute right-0 top-0 bottom-0 z-20 w-[440px] max-w-[34vw] touch-auto">
              <div className="flex h-full flex-col overflow-hidden border-l border-border bg-card text-card-foreground backdrop-blur">
                <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
                  <div className="min-w-0">
                    <div className="text-sm text-muted-foreground">
                      {labelByLayer(layer)}
                    </div>
                    <div className="mt-1 truncate text-2xl font-semibold">
                      {active.name}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      キャラクターを選択
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/60"
                    onClick={() => setActiveId(null)}
                  >
                    閉じる
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-5">
                  <div className="grid grid-cols-1 gap-3">
                    {charactersHere.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openCharacterChat(c)}
                        disabled={loadingChar === c.id}
                        className="group flex items-center gap-4 rounded-2xl border border-border bg-muted/30 px-4 py-4 text-left transition hover:bg-muted/45 disabled:opacity-60"
                      >
                        <CharacterAvatar character={c} size="md" />
                        <div className="min-w-0">
                          <div className="truncate text-lg font-semibold">
                            {c.name}
                          </div>
                          <div className="mt-1 truncate text-sm text-muted-foreground">
                            {c.title}
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            {loadingChar === c.id ? "接続中…" : "話しかける"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* B: Mobile/Tablet bottom bar */}
          {active ? (
            <div className="map-ui pointer-events-auto lg:hidden absolute inset-x-0 bottom-0 z-20 touch-auto">
              <div className="border-t border-border bg-card text-card-foreground backdrop-blur">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {labelByLayer(layer)}
                    </div>
                    <div className="truncate text-lg font-semibold">
                      {active.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/60"
                    onClick={() => setActiveId(null)}
                  >
                    閉じる
                  </button>
                </div>

                <div className="px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                  <div className="mx-auto flex max-w-[720px] flex-col items-stretch gap-3">
                    {charactersHere.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openCharacterChat(c)}
                        disabled={loadingChar === c.id}
                        className="w-full max-w-[560px] rounded-2xl border border-border bg-muted/30 px-4 py-4 text-left transition hover:bg-muted/45 disabled:opacity-60"
                      >
                        <div className="flex items-center justify-start gap-4">
                          <CharacterAvatar character={c} size="md" />
                          <div className="min-w-0 text-left">
                            <div className="truncate text-base font-semibold">
                              {c.name}
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {c.title}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {loadingChar === c.id ? "接続中…" : "タップで会話"}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          </TransformWrapper>
        </div>
      </TooltipProvider>
    </div>
  );
}
