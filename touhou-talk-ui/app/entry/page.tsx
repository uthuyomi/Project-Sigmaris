import Link from "next/link";

import TopShell from "@/components/top/TopShell";
import { CHARACTERS, isCharacterSelectable, type CharacterDef } from "@/data/characters";
import { LOCATIONS, type LayerId } from "@/lib/map/locations";
import EntryLocationAccordion, { type EntryLayerGroup } from "./EntryLocationAccordion";

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
      return "白玉楼";
  }
}

function groupLabelForCharacter(ch: CharacterDef): LayerId | null {
  const layer = ch.world?.map;
  if (layer === "gensokyo" || layer === "deep" || layer === "higan") return layer;
  return null;
}

function charactersByGroup(): Record<LayerId, CharacterDef[]> {
  const out: Record<LayerId, CharacterDef[]> = { gensokyo: [], deep: [], higan: [] };
  for (const ch of Object.values(CHARACTERS)) {
    // /entry では「選択可能（enabled=true かつ avatarあり）」のみ表示
    if (!isCharacterSelectable(ch)) continue;
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

function charactersByLocationInLayer(layer: LayerId, chars: CharacterDef[]) {
  const locations = LOCATIONS.filter((l) => l.layer === layer);
  const locationIds = new Set(locations.map((l) => l.id));

  const byId = new Map<string, CharacterDef[]>();
  for (const ch of chars) {
    const loc = typeof ch.world?.location === "string" ? ch.world.location : "";
    if (!loc) continue;
    const arr = byId.get(loc) ?? [];
    arr.push(ch);
    byId.set(loc, arr);
  }

  for (const arr of byId.values()) {
    arr.sort((a, b) => String(a.name).localeCompare(String(b.name), "ja"));
  }

  const ordered = locations
    .map((loc) => ({
      id: loc.id,
      name: loc.name,
      characters: byId.get(loc.id) ?? [],
    }))
    .filter((g) => g.characters.length > 0);

  const others = [...byId.entries()]
    .filter(([id]) => !locationIds.has(id))
    .sort(([a], [b]) => a.localeCompare(b, "ja"))
    .map(([id, characters]) => ({
      id,
      name: id,
      characters,
    }))
    .filter((g) => g.characters.length > 0);

  return { ordered, others };
}

export default function EntryPage() {
  const byGroup = charactersByGroup();
  const layers: LayerId[] = ["gensokyo", "deep", "higan"];

  const layerData: EntryLayerGroup[] = layers.map((layer) => {
    const { ordered, others } = charactersByLocationInLayer(layer, byGroup[layer] ?? []);
    const groups = [...ordered, ...others].map((g) => ({
      id: g.id,
      name: g.name,
      count: g.characters.length,
      characters: g.characters.map((ch) => ({
        id: ch.id,
        name: ch.name,
        title: ch.title,
        layer,
        locationId: g.id,
        locationName: g.name,
        tts: ch.tts,
        world: ch.world,
        ui: ch.ui,
      })),
    }));

    return {
      layer,
      label: layerLabel(layer),
      locations: groups,
    };
  });

  return (
    <TopShell fog scroll backgroundVariant="none">
      <div className="w-full max-w-6xl text-white">
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
        </section>

        <EntryLocationAccordion layers={layerData} />
      </div>
    </TopShell>
  );
}
