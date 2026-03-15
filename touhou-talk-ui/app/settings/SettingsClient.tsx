"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { CHARACTER_CATALOG } from "@/lib/touhouPersona/characterCatalog";
import type { DesktopCharacterSettings, DesktopTtsMode } from "@/lib/desktop/desktopSettingsTypes";

export default function SettingsClient() {
  const [skipMap, setSkipMapState] = useState(false);
  const [theme, setThemeState] = useState<TouhouTheme>("dark");
  const [chatMode, setChatMode] = useState<TouhouChatMode>("partner");

  const [selectedChar, setSelectedChar] = useState<string>(() => CHARACTER_CATALOG[0]?.id ?? "reimu");
  const [charExists, setCharExists] = useState<boolean>(false);
  const [charSettings, setCharSettings] = useState<DesktopCharacterSettings | null>(null);
  const [charLoading, setCharLoading] = useState<boolean>(false);
  const [charError, setCharError] = useState<string | null>(null);
  const [charInfo, setCharInfo] = useState<string | null>(null);

  useEffect(() => {
    setSkipMapState(getSkipMapOnStart());
    setThemeState(getTheme());
    setChatMode(getDefaultChatMode());
  }, []);

  const updateTheme = (t: TouhouTheme) => {
    setThemeState(t);
    setTheme(t);
    applyThemeClass(t);
  };

  const title = useMemo(() => "設定", []);

  const loadCharSettings = async (charId: string) => {
    setCharLoading(true);
    setCharError(null);
    setCharInfo(null);
    try {
      const res = await fetch(`/api/desktop/character-settings?char=${encodeURIComponent(charId)}`, {
        cache: "no-store",
      });
      const j = (await res.json().catch(() => null)) as
        | { ok: boolean; exists?: boolean; settings?: DesktopCharacterSettings | null; error?: string }
        | null;
      if (!res.ok || !j?.ok) {
        throw new Error(String(j?.error ?? `HTTP ${res.status}`));
      }
      const exists = !!j.exists;
      setCharExists(exists);
      setCharSettings(exists ? (j.settings ?? null) : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCharError(msg);
      setCharExists(false);
      setCharSettings(null);
    } finally {
      setCharLoading(false);
    }
  };

  useEffect(() => {
    void loadCharSettings(selectedChar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChar]);

  const initCharSettings = async () => {
    setCharLoading(true);
    setCharError(null);
    setCharInfo(null);
    try {
      const res = await fetch(`/api/desktop/character-settings?char=${encodeURIComponent(selectedChar)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok: boolean; settings?: DesktopCharacterSettings | null; error?: string }
        | null;
      if (!res.ok || !j?.ok || !j.settings) throw new Error(String(j?.error ?? `HTTP ${res.status}`));
      setCharExists(true);
      setCharSettings(j.settings);
      setCharInfo("設定を作成したよ。");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCharError(msg);
    } finally {
      setCharLoading(false);
    }
  };

  const saveCharSettings = async () => {
    if (!charSettings) return;
    setCharLoading(true);
    setCharError(null);
    setCharInfo(null);
    try {
      const res = await fetch(`/api/desktop/character-settings?char=${encodeURIComponent(selectedChar)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", settings: charSettings }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok: boolean; settings?: DesktopCharacterSettings | null; error?: string }
        | null;
      if (!res.ok || !j?.ok || !j.settings) throw new Error(String(j?.error ?? `HTTP ${res.status}`));
      setCharSettings(j.settings);
      setCharInfo("保存したよ。");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCharError(msg);
    } finally {
      setCharLoading(false);
    }
  };

  const uploadVrm = async (file: File) => {
    setCharLoading(true);
    setCharError(null);
    setCharInfo(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/desktop/character-vrm?char=${encodeURIComponent(selectedChar)}`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !j?.ok) throw new Error(String(j?.error ?? `HTTP ${res.status}`));
      setCharInfo("VRMを取り込んだよ。");
      await loadCharSettings(selectedChar);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCharError(msg);
    } finally {
      setCharLoading(false);
    }
  };

  const uploadMotions = async (motionsJson: File | null, glbs: File[]) => {
    setCharLoading(true);
    setCharError(null);
    setCharInfo(null);
    try {
      const fd = new FormData();
      if (motionsJson) fd.set("motionsJson", motionsJson);
      for (const g of glbs) fd.append("glbs", g);
      const res = await fetch(
        `/api/desktop/character-motions-import?char=${encodeURIComponent(selectedChar)}`,
        { method: "POST", body: fd },
      );
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; motionsCount?: number } | null;
      if (!res.ok || !j?.ok) throw new Error(String(j?.error ?? `HTTP ${res.status}`));
      setCharInfo(`モーションを取り込んだよ（${String(j?.motionsCount ?? "?")}件）。`);
      await loadCharSettings(selectedChar);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCharError(msg);
    } finally {
      setCharLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-gensou text-2xl">{title}</h1>
          <p className="text-muted-foreground text-sm">
            見た目・起動時の挙動などを変更します。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/chat/session">チャットへ戻る</Link>
        </Button>
      </div>

      <Separator />

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">起動</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Touhou Talk を起動した時の挙動を設定します。
        </p>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-sm">マップをスキップ</div>
            <div className="text-muted-foreground text-xs">
              起動後にマップを表示せず、チャット画面に直接移動します。
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
        <p className="mt-1 text-muted-foreground text-sm">
          見た目のテーマを切り替えます。
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ThemeButton label="Light" active={theme === "light"} onClick={() => updateTheme("light")} />
          <ThemeButton label="Dark" active={theme === "dark"} onClick={() => updateTheme("dark")} />
          <ThemeButton
            label="Sigmaris"
            active={theme === "sigmaris"}
            onClick={() => updateTheme("sigmaris")}
          />
          <ThemeButton label="Soft" active={theme === "soft"} onClick={() => updateTheme("soft")} />
        </div>
      </section>

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">会話モード</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          応答のスタイル（雑談/ロールプレイ等）を切り替えます。
        </p>

        <div className="mt-4">
          <select
            className="w-full rounded-xl border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-ring"
            value={chatMode}
            onChange={(e) => {
              const v = e.currentTarget.value;
              const next: TouhouChatMode =
                v === "roleplay" ? "roleplay" : v === "coach" ? "coach" : "partner";
              setChatMode(next);
              setDefaultChatMode(next);
            }}
          >
            <option value="partner">雑談（バランス）</option>
            <option value="roleplay">ロールプレイ（世界観寄り）</option>
            <option value="coach">コーチ（助言寄り）</option>
          </select>
        </div>
      </section>

      <Separator />

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">キャラクター（VRM / TTS / モーション）</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Electron版のみ：キャラごとにVRM・TTS・モーションを設定して保存します。
        </p>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-2">
            <div className="text-sm font-medium">キャラ選択</div>
            <select
              className="w-full rounded-xl border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-ring"
              value={selectedChar}
              onChange={(e) => setSelectedChar(e.currentTarget.value)}
            >
              {CHARACTER_CATALOG.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}（{c.id}）
                </option>
              ))}
            </select>
          </div>

          {charError ? (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
              エラー: {charError}
            </div>
          ) : null}

          {charInfo ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              {charInfo}
            </div>
          ) : null}

          {!charExists ? (
            <div className="rounded-xl border bg-background/40 px-4 py-4">
              <div className="text-sm font-medium">このキャラの設定はまだ作成されてない</div>
              <div className="mt-1 text-muted-foreground text-xs">
                先に「設定を作成」してから、VRMやTTSを設定して保存してね。
              </div>
              <div className="mt-3">
                <Button type="button" disabled={charLoading} onClick={initCharSettings}>
                  設定を作成
                </Button>
              </div>
            </div>
          ) : null}

          {charExists && charSettings ? (
            <div className="grid gap-4">
              <div className="rounded-xl border bg-background/40 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">VRM</div>
                    <div className="text-muted-foreground text-xs">
                      現在: {charSettings.vrm.enabled ? "有効" : "無効"}
                      {charSettings.vrm.path ? ` / ${charSettings.vrm.path}` : ""}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!charSettings.vrm.enabled}
                      onChange={(e) => {
                        const v = e.currentTarget.checked;
                        setCharSettings({ ...charSettings, vrm: { ...charSettings.vrm, enabled: v } });
                      }}
                      className="size-4"
                    />
                    有効
                  </label>
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="text-xs text-muted-foreground">
                    VRMファイルを選ぶ（取り込み後、保存は不要。内部で設定も更新する）
                  </div>
                  <input
                    type="file"
                    accept=".vrm"
                    disabled={charLoading}
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0] ?? null;
                      if (f) void uploadVrm(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="rounded-xl border bg-background/40 px-4 py-4">
                <div className="text-sm font-medium">TTS</div>
                <div className="mt-2 grid gap-3">
                  <div className="grid gap-2">
                    <div className="text-xs text-muted-foreground">モード</div>
                    <select
                      className="w-full rounded-xl border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-ring"
                      value={charSettings.tts.mode}
                      onChange={(e) => {
                        const v = e.currentTarget.value as DesktopTtsMode;
                        setCharSettings({ ...charSettings, tts: { ...charSettings.tts, mode: v } });
                      }}
                    >
                      <option value="none">なし</option>
                      <option value="browser">Browser（Web Speech API）</option>
                      <option value="aquestalk">AquesTalk</option>
                    </select>
                  </div>

                  {charSettings.tts.mode === "aquestalk" ? (
                    <div className="grid gap-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!charSettings.tts.aquestalk.enabled}
                          onChange={(e) => {
                            const v = e.currentTarget.checked;
                            setCharSettings({
                              ...charSettings,
                              tts: {
                                ...charSettings.tts,
                                aquestalk: { ...charSettings.tts.aquestalk, enabled: v },
                              },
                            });
                          }}
                          className="size-4"
                        />
                        AquesTalkを有効化
                      </label>

                      <label className="grid gap-1 text-sm">
                        <span className="text-xs text-muted-foreground">
                          AquesTalkフォルダ（任意・未指定なら既定パスを試す）
                        </span>
                        <input
                          type="text"
                          value={charSettings.tts.aquestalk.rootDir ?? ""}
                          placeholder="例: D:\\aquestalk"
                          onChange={(e) => {
                            const v = e.currentTarget.value.trim();
                            setCharSettings({
                              ...charSettings,
                              tts: {
                                ...charSettings.tts,
                                aquestalk: { ...charSettings.tts.aquestalk, rootDir: v ? v : null },
                              },
                            });
                          }}
                          className="rounded-lg border bg-background/60 px-3 py-2 text-sm"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="grid gap-1 text-sm">
                          <span className="text-xs text-muted-foreground">Speed（50〜300）</span>
                          <input
                            type="number"
                            min={50}
                            max={300}
                            value={charSettings.tts.aquestalk.speed}
                            onChange={(e) => {
                              const n = Number(e.currentTarget.value);
                              setCharSettings({
                                ...charSettings,
                                tts: {
                                  ...charSettings.tts,
                                  aquestalk: { ...charSettings.tts.aquestalk, speed: n },
                                },
                              });
                            }}
                            className="rounded-lg border bg-background/60 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="grid gap-1 text-sm">
                          <span className="text-xs text-muted-foreground">Voice（例: f1）</span>
                          <input
                            type="text"
                            value={charSettings.tts.aquestalk.voice}
                            onChange={(e) => {
                              const v = e.currentTarget.value;
                              setCharSettings({
                                ...charSettings,
                                tts: {
                                  ...charSettings.tts,
                                  aquestalk: { ...charSettings.tts.aquestalk, voice: v },
                                },
                              });
                            }}
                            className="rounded-lg border bg-background/60 px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border bg-background/40 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">モーション</div>
                    <div className="text-muted-foreground text-xs">
                      現在: {charSettings.motions.enabled ? "有効" : "無効"}
                      {charSettings.motions.indexPath ? ` / ${charSettings.motions.indexPath}` : ""}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!charSettings.motions.enabled}
                      onChange={(e) => {
                        const v = e.currentTarget.checked;
                        setCharSettings({
                          ...charSettings,
                          motions: { ...charSettings.motions, enabled: v },
                        });
                      }}
                      className="size-4"
                    />
                    有効
                  </label>
                </div>

                <div className="mt-3 grid gap-2">
                  <div className="text-xs text-muted-foreground">
                    motions.json（任意）と、GLB（複数）を選んで取り込み
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input id="motions-json" type="file" accept="application/json,.json" disabled={charLoading} />
                    <input id="motions-glbs" type="file" accept=".glb" multiple disabled={charLoading} />
                  </div>
                  <div>
                    <Button
                      type="button"
                      disabled={charLoading}
                      onClick={() => {
                        const jsonEl = document.getElementById("motions-json") as HTMLInputElement | null;
                        const glbEl = document.getElementById("motions-glbs") as HTMLInputElement | null;
                        const motionsJson = jsonEl?.files?.[0] ?? null;
                        const glbs = Array.from(glbEl?.files ?? []);
                        void uploadMotions(motionsJson, glbs);
                        if (jsonEl) jsonEl.value = "";
                        if (glbEl) glbEl.value = "";
                      }}
                    >
                      モーション取り込み
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button type="button" variant="outline" disabled={charLoading} onClick={() => loadCharSettings(selectedChar)}>
                  再読み込み
                </Button>
                <Button type="button" disabled={charLoading} onClick={saveCharSettings}>
                  保存
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

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
      <div className="font-medium text-sm">{label}</div>
      <div className="text-muted-foreground text-xs">{active ? "選択中" : " "}</div>
    </button>
  );
}
