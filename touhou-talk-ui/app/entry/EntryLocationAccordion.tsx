"use client";

import Link from "next/link";

type EntryCharacter = {
  id: string;
  name: string;
  title: string;
  world?: {
    map: string;
    location: string;
  };
  ui: {
    avatar?: string;
    chatBackground: string;
    placeholder: string;
  };
};

type EntryLocationGroup = {
  id: string;
  name: string;
  count: number;
  characters: EntryCharacter[];
};

export type EntryLayerGroup = {
  layer: string;
  label: string;
  locations: EntryLocationGroup[];
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/80 backdrop-blur">
      {children}
    </span>
  );
}

function buildNextPath(ch: EntryCharacter) {
  const layer = ch.world?.map ? String(ch.world.map) : "";
  const loc = ch.world?.location ? String(ch.world.location) : "";
  const sp = new URLSearchParams();
  sp.set("char", ch.id);
  if (layer) sp.set("layer", layer);
  if (loc) sp.set("loc", loc);
  return `/chat/session?${sp.toString()}`;
}

function CharacterCard({ ch }: { ch: EntryCharacter }) {
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

        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/10 to-black/70" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Chip>ロールプレイ</Chip>
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

export default function EntryLocationAccordion({
  layers,
}: {
  layers: EntryLayerGroup[];
}) {
  return (
    <div id="locations" className="mt-8 space-y-10">
      {layers.map((layer) => (
        <section
          key={layer.layer}
          id={`entry-layer-${layer.layer}`}
          data-entry-section={layer.layer}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <div className="text-xs font-medium text-white/70">{layer.label}</div>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {layer.locations.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/70">
              このレイヤにはキャラクターがまだいないよ。
            </div>
          ) : (
            <div className="space-y-12">
              {layer.locations.map((loc) => (
                <div key={`${layer.layer}:${loc.id}`} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-white">{loc.name}</div>
                    <div className="text-xs text-white/50">{loc.count}人</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {loc.characters.map((ch) => (
                      <CharacterCard key={ch.id} ch={ch} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
