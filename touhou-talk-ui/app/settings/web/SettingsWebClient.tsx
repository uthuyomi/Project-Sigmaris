"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import DevCoreToggle from "@/components/dev/DevCoreToggle";
import {
  applyThemeClass,
  getDefaultChatMode,
  getSkipMapOnStart,
  getTheme,
  setDefaultChatMode,
  setSkipMapOnStart,
  setTheme,
  type TouhouChatMode,
  type TouhouTheme,
} from "@/lib/touhou-settings";

function ThemeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-4 py-3 text-left transition",
        active ? "border-ring bg-accent/70" : "border-border hover:bg-accent/40",
      ].join(" ")}
    >
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{active ? "選択中" : " "}</div>
    </button>
  );
}

export default function SettingsWebClient() {
  const [skipMap, setSkipMapState] = useState(() => getSkipMapOnStart());
  const [theme, setThemeState] = useState<TouhouTheme>(() => getTheme());
  const [chatMode, setChatMode] = useState<TouhouChatMode>(() => getDefaultChatMode());

  const updateTheme = (t: TouhouTheme) => {
    setThemeState(t);
    setTheme(t);
    applyThemeClass(t);
  };

  const title = useMemo(() => "Web 設定", []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-gensou text-2xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Web 版で利用する表示設定と会話モードを調整できます。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/chat/session">チャットへ</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings/relationship">関係性設定</Link>
        </Button>
      </div>

      <Separator />

      <DevCoreToggle />

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">起動設定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          起動時にマップ画面を表示するかどうかを切り替えます。
        </p>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">マップをスキップ</div>
            <div className="text-xs text-muted-foreground">
              有効にすると、ログイン後にマップを経由せずチャット画面へ移動します。
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipMap}
              onChange={(e) => {
                const v = e.currentTarget.checked;
                setSkipMapState(v);
                setSkipMapOnStart(v);
              }}
              className="size-4"
            />
            {skipMap ? "ON" : "OFF"}
          </label>
        </div>
      </section>

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">テーマ</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          表示テーマを選択できます。
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ThemeButton label="Light" active={theme === "light"} onClick={() => updateTheme("light")} />
          <ThemeButton label="Dark" active={theme === "dark"} onClick={() => updateTheme("dark")} />
          <ThemeButton label="Sigmaris" active={theme === "sigmaris"} onClick={() => updateTheme("sigmaris")} />
          <ThemeButton label="Soft" active={theme === "soft"} onClick={() => updateTheme("soft")} />
        </div>
      </section>

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">会話モード</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          会話スタイルの基本モードを選択できます。
        </p>

        <div className="mt-4">
          <select
            className="w-full rounded-xl border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-ring"
            value={chatMode}
            onChange={(e) => {
              const v = e.currentTarget.value;
              const next: TouhouChatMode = v === "roleplay" ? "roleplay" : v === "coach" ? "coach" : "partner";
              setChatMode(next);
              setDefaultChatMode(next);
            }}
          >
            <option value="partner">パートナー</option>
            <option value="roleplay">ロールプレイ</option>
            <option value="coach">コーチ</option>
          </select>
        </div>
      </section>
    </div>
  );
}
