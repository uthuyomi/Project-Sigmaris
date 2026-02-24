import Link from "next/link";

import TopShell from "@/components/top/TopShell";
import { CHARACTERS, type CharacterDef } from "@/data/characters";
import { LOCATIONS, type LayerId, type MapLocation } from "@/lib/map/locations";

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
      className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/10 p-4 text-left text-white backdrop-blur hover:bg-white/15"
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ch.ui?.avatar ? (
          <img
            src={ch.ui.avatar}
            alt={ch.name}
            className="h-12 w-12 rounded-lg object-cover ring-1 ring-white/10"
            loading="lazy"
          />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-white/10 ring-1 ring-white/10" />
        )}

        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{ch.name}</div>
          <div className="truncate text-xs text-white/60">{ch.title}</div>
        </div>
      </div>

      <div className="mt-3 text-xs text-white/70">
        <span className="inline-flex items-center rounded-md border border-white/10 bg-black/20 px-2 py-1">
          チャットを開く
        </span>
      </div>

      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/0 to-white/10" />
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
    <TopShell fog>
      <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-black/30 p-6 text-white backdrop-blur">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-gensou text-2xl tracking-wide">キャラクター選択</h1>
            <p className="mt-1 text-sm text-white/65">
              ロケーションごとに選べるよ。気になった子を押してみて。
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white/80 hover:bg-white/15"
          >
            既存トップへ
          </Link>
        </div>

        <div className="space-y-6">
          {layers.map((layer) => (
            <section key={layer} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <div className="text-xs font-medium text-white/70">
                  {layerLabel(layer)}
                </div>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="space-y-5">
                {locationsByLayer[layer].map((loc) => {
                  const key = locationKey(loc);
                  const chars = byLoc.get(key) ?? [];
                  if (chars.length === 0) return null;

                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{loc.name}</div>
                        <div className="text-xs text-white/50">{chars.length}人</div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

