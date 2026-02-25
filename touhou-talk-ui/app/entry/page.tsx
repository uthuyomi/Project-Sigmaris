import Link from "next/link";
import Image from "next/image";

import TopShell from "@/components/top/TopShell";
import {
  CHARACTERS,
  isCharacterSelectable,
  type CharacterDef,
} from "@/data/characters";
import { LOCATIONS, type LayerId } from "@/lib/map/locations";
import EntryLocationAccordion, {
  type EntryLayerGroup,
} from "./EntryLocationAccordion";
import EntryTouhouBackground from "./EntryTouhouBackground";
import PwaInstallButton from "@/components/pwa/PwaInstallButton";
import styles from "./entry-theme.module.css";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-medium text-secondary-foreground">
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
  if (layer === "gensokyo" || layer === "deep" || layer === "higan")
    return layer;
  return null;
}

function buildNextPathForCharacterId(characterId: string) {
  const ch = CHARACTERS[characterId];
  const layer = typeof ch?.world?.map === "string" ? ch.world.map : "";
  const loc = typeof ch?.world?.location === "string" ? ch.world.location : "";
  const sp = new URLSearchParams();
  sp.set("char", characterId);
  if (layer) sp.set("layer", layer);
  if (loc) sp.set("loc", loc);
  return `/chat/session?${sp.toString()}`;
}

function HeroCharacterButton({
  characterId,
  label,
  className,
  showAvatar = false,
}: {
  characterId: string;
  label: string;
  className?: string;
  showAvatar?: boolean;
}) {
  const ch = CHARACTERS[characterId];
  const selectable = isCharacterSelectable(ch);
  const nextPath = buildNextPathForCharacterId(characterId);
  const href = `/entry/require-login?next=${encodeURIComponent(nextPath)}`;
  const avatarSrc = typeof ch?.ui?.avatar === "string" ? ch.ui.avatar : "";

  const content = (
    <span className="inline-flex items-center justify-center gap-2">
      {showAvatar && avatarSrc ? (
        <span className="relative h-7 w-7 overflow-hidden rounded-full border border-border bg-secondary shadow-sm">
          <Image src={avatarSrc} alt="" fill className="object-cover" />
        </span>
      ) : null}
      <span className="whitespace-nowrap">{label}と話す</span>
    </span>
  );

  return selectable ? (
    <Link
      href={href}
      className={
        className ??
        "rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-white/90"
      }
    >
      {content}
    </Link>
  ) : (
    <div
      className={
        className ??
        "rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55"
      }
    >
      <span className="inline-flex items-center justify-center gap-2">
        {showAvatar && avatarSrc ? (
          <span className="relative h-7 w-7 overflow-hidden rounded-full border border-border bg-secondary">
            <Image src={avatarSrc} alt="" fill className="object-cover opacity-60" />
          </span>
        ) : null}
        <span className="whitespace-nowrap">{label}（準備中）</span>
      </span>
    </div>
  );
}

function charactersByGroup(): Record<LayerId, CharacterDef[]> {
  const out: Record<LayerId, CharacterDef[]> = {
    gensokyo: [],
    deep: [],
    higan: [],
  };
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
    const { ordered, others } = charactersByLocationInLayer(
      layer,
      byGroup[layer] ?? [],
    );
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
    <TopShell
      scroll
      backgroundVariant="none"
      backgroundSlot={<EntryTouhouBackground />}
      className={`${styles.entryTheme} bg-background text-foreground`}
    >
      <div className="w-full max-w-6xl">
        {/* Hero image + CTA */}
        <section
          id="entry-hero"
          data-entry-section="hero"
          className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-transparent"
        >
          <div className="relative aspect-[3/2] w-full">
            <Image
              src="/entry/hero.png"
              alt="魔理沙・霊夢・アリス"
              fill
              priority
              className="object-contain"
            />

            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
              <div className="rounded-2xl border border-border bg-card/85 p-5 shadow-sm">
                <div className="text-xs font-medium text-muted-foreground">
                  Touhou Talk
                </div>
                <h1 className="mt-2 font-gensou text-2xl tracking-wide sm:text-3xl">
                  東方キャラと“ちゃんと会話できる”体験。
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  キャラクターを選んで、ログインしたらすぐ会話を始められるよ。
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Chip>ロケーション別</Chip>
                  <Chip>カードで選択</Chip>
                  <Chip>ログイン後に開始</Chip>
                </div>

                <div className="mt-5">
                  <a
                    href="#locations"
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                  >
                    キャラを選ぶ
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Info */}
        <section
          id="entry-info"
          data-entry-section="info"
          className="mx-auto mt-10 w-full max-w-6xl space-y-4"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-wide">はじめに</h2>
            <p className="text-sm text-muted-foreground">
              迷わず始められるように、要点だけまとめたよ。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <div className="text-sm font-semibold">遊び方</div>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>1. キャラを選ぶ</li>
                <li>2. ログインする</li>
                <li>3. そのまま会話を始める</li>
              </ol>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <div className="text-sm font-semibold">ロールプレイ方針</div>
              <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
                口調や雰囲気の再現を優先するよ。キャラごとに距離感やテンポが違うから、合う相手を探してみてね。
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
              <div className="text-sm font-semibold">推奨環境</div>
              <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
                PC/タブレット/スマホ対応。Chrome/Safariの最新版推奨。
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-10 w-full max-w-6xl">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-wide">キャラクター一覧</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                ロケーション別に並んでいるよ。気になるカードから入ってみて。
              </p>
            </div>
            <a
              href="#entry-hero"
              className="text-sm font-medium text-primary hover:opacity-80"
            >
              上へ戻る
            </a>
          </div>
        </section>

        <EntryLocationAccordion layers={layerData} />

        <section
          id="entry-install"
          data-entry-section="install"
          className="mx-auto mt-10 w-full max-w-6xl space-y-3"
        >
          <h2 className="text-xl font-semibold tracking-wide">ホームに追加</h2>
          <p className="text-sm text-muted-foreground">
            スマホやPCのホームに追加しておくと、次からすぐ開けるよ。
          </p>
          <PwaInstallButton />
        </section>

        <footer className="mx-auto mt-14 w-full max-w-6xl border-t border-border py-10 text-muted-foreground">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-foreground">順次追加</div>
              <div className="mt-3 text-sm leading-relaxed">
                アバター画像と内部設定が揃ったキャラから、選択できるように増やしていくよ。
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-foreground">不具合報告・要望</div>
              <div className="mt-3 text-sm leading-relaxed">
                ここが変だなと思ったら、GitHub
                Issuesに投げてくれると助かるよ。チャット画面なら{" "}
                <span className="font-mono text-foreground/80">/dump</span>{" "}
                でログを書き出せる。
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="https://github.com/uthuyomi/sigmaris-project/issues"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground hover:bg-secondary/80"
                >
                  GitHub Issues
                </a>
                <Link
                  href="/legal/terms"
                  className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground hover:bg-secondary/80"
                >
                  利用規約
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>Copyright © {new Date().getFullYear()} Touhou Talk</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/legal/privacy" className="hover:text-foreground/80">
                プライバシー
              </Link>
              <Link href="/legal/terms" className="hover:text-foreground/80">
                利用規約
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </TopShell>
  );
}
