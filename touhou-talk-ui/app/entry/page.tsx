import Link from "next/link";

import TopShell from "@/components/top/TopShell";
import { CHARACTERS, type CharacterDef } from "@/data/characters";
import { LOCATIONS, type LayerId, type MapLocation } from "@/lib/map/locations";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/80 backdrop-blur">
      {children}
    </span>
  );
}

function layerLabel(layer: LayerId) {
  switch (layer) {
    case "gensokyo":
      return "幻想郷";
    case "deep":
      return "地底";
    case "higan":
      return "彼岸";
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

function locationKey(loc: MapLocation) {
  return `${loc.layer}:${loc.id}`;
}

function charactersByLocation() {
  const byKey = new Map<string, CharacterDef[]>();
  for (const ch of Object.values(CHARACTERS)) {
    const layer = ch.world?.map;
    const loc = ch.world?.location;
    if (!layer || !loc) continue;
    const k = `${layer}:${loc}`;
    const arr = byKey.get(k) ?? [];
    arr.push(ch);
    byKey.set(k, arr);
  }
  for (const arr of byKey.values()) {
    arr.sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"));
  }
  return byKey;
}

function CharacterCard({ ch }: { ch: CharacterDef }) {
  const nextPath = buildNextPath(ch);
  const href = `/entry/require-login?next=${encodeURIComponent(nextPath)}`;

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left text-white backdrop-blur transition-colors hover:bg-white/10"
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

        {/* vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/70" />

        {/* top chips */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Chip>ロールプレイ</Chip>
          <Chip>選択して開始</Chip>
        </div>

        {/* bottom meta */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-base font-semibold leading-tight drop-shadow">
            {ch.name}
          </div>
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

export default function EntryPage() {
  const byLoc = charactersByLocation();

  const layers: LayerId[] = ["gensokyo", "deep", "higan"];
  const locationsByLayer: Record<LayerId, MapLocation[]> = {
    gensokyo: [],
    deep: [],
    higan: [],
  };
  for (const loc of LOCATIONS) {
    locationsByLayer[loc.layer].push(loc);
  }

  return (
    <TopShell fog scroll>
      <div className="w-full max-w-6xl text-white">
        {/* Hero */}
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
        </section>

        {/* Locations */}
        <div id="locations" className="mt-8 space-y-8">
          {layers.map((layer) => (
            <section key={layer} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <div className="text-xs font-medium text-white/70">
                  {layerLabel(layer)}
                </div>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="space-y-6">
                {locationsByLayer[layer].map((loc) => {
                  const key = locationKey(loc);
                  const chars = byLoc.get(key) ?? [];
                  if (chars.length === 0) return null;

                  return (
                    <div key={key} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-semibold">{loc.name}</div>
                        <div className="text-xs text-white/50">{chars.length}人</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {chars.map((ch) => (
                          <CharacterCard key={ch.id} ch={ch} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </TopShell>
  );
}
