"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { CHARACTER_CATALOG } from "@/lib/touhouPersona/characterCatalog";
import type { DesktopCharacterSettings, DesktopTtsMode } from "@/lib/desktop/desktopSettingsTypes";

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

function FileStatus({
  label,
  value,
}: {
  label: string;
  value: { kind: "none" } | { kind: "file"; name: string } | { kind: "files"; names: string[] };
}) {
  const body =
    value.kind === "none" ? (
      <span className="text-muted-foreground">未選択</span>
    ) : value.kind === "file" ? (
      <span className="font-mono">{value.name}</span>
    ) : (
      <span className="font-mono">
        {value.names.length} 件{" "}
        {value.names.length ? (
          <span className="text-muted-foreground">
            ({value.names.slice(0, 2).join(", ")}
            {value.names.length > 2 ? "..." : ""})
          </span>
        ) : null}
      </span>
    );

  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      {body}
    </div>
  );
}

export default function SettingsClient() {
  const [skipMap, setSkipMapState] = useState(false);
  const [theme, setThemeState] = useState<TouhouTheme>("dark");
  const [chatMode, setChatMode] = useState<TouhouChatMode>("partner");

  const [selectedChar, setSelectedChar] = useState<string>(() => CHARACTER_CATALOG[0]?.id ?? "reimu");
  const [charExists, setCharExists] = useState(false);
  const [charSettings, setCharSettings] = useState<DesktopCharacterSettings | null>(null);
  const [charLoading, setCharLoading] = useState(false);
  const [charError, setCharError] = useState<string | null>(null);
  const [charInfo, setCharInfo] = useState<string | null>(null);

  const vrmInputRef = useRef<HTMLInputElement | null>(null);
  const motionsJsonRef = useRef<HTMLInputElement | null>(null);
  const motionsGlbsRef = useRef<HTMLInputElement | null>(null);

  const [pendingVrmFile, setPendingVrmFile] = useState<File | null>(null);
  const [pendingMotionsJson, setPendingMotionsJson] = useState<File | null>(null);
  const [pendingMotionGlbs, setPendingMotionGlbs] = useState<File[]>([]);

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

  const title = useMemo(() => "デスクトップ設定", []);

  const notifyDesktopUpdated = () => {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("touhou-desktop:vrm-updated", {
            detail: { characterId: selectedChar, rev: String(Date.now()) },
          }),
        );
      }
    } catch {
      // ignore
    }
  };

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
      if (!res.ok || !j?.ok) throw new Error(String(j?.error ?? `HTTP ${res.status}`));
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

  useEffect(() => {
    setPendingVrmFile(null);
    setPendingMotionsJson(null);
    setPendingMotionGlbs([]);
    if (vrmInputRef.current) vrmInputRef.current.value = "";
    if (motionsJsonRef.current) motionsJsonRef.current.value = "";
    if (motionsGlbsRef.current) motionsGlbsRef.current.value = "";
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
      setCharInfo("設定を初期化しました。次は VRM / TTS / モーションを登録してください。");
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
      setCharInfo("保存しました。");
      notifyDesktopUpdated();
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
      setCharInfo(`VRM をアップロードしました: ${file.name}`);
      await loadCharSettings(selectedChar);
      notifyDesktopUpdated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCharError(msg);
    } finally {
      setPendingVrmFile(null);
      if (vrmInputRef.current) vrmInputRef.current.value = "";
      setCharLoading(false);
    }
  };

  const uploadMotions = async (motionsJson: File | null, glbs: File[]) => {
    setCharLoading(true);
    setCharError(null);
    setCharInfo(null);
    try {
      if (!motionsJson && glbs.length === 0) throw new Error("motions.json か GLB を選択してください。");
      const fd = new FormData();
      if (motionsJson) fd.set("motionsJson", motionsJson);
      for (const g of glbs) fd.append("glbs", g);
      const res = await fetch(
        `/api/desktop/character-motions-import?char=${encodeURIComponent(selectedChar)}`,
        { method: "POST", body: fd },
      );
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; motionsCount?: number } | null;
      if (!res.ok || !j?.ok) throw new Error(String(j?.error ?? `HTTP ${res.status}`));
      setCharInfo(`モーションをアップロードしました: ${String(j?.motionsCount ?? "?")} 件`);
      await loadCharSettings(selectedChar);
      notifyDesktopUpdated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCharError(msg);
    } finally {
      setPendingMotionsJson(null);
      setPendingMotionGlbs([]);
      if (motionsJsonRef.current) motionsJsonRef.current.value = "";
      if (motionsGlbsRef.current) motionsGlbsRef.current.value = "";
      setCharLoading(false);
    }
  };

  const ttsSummary =
    !charSettings
      ? ""
      : charSettings.tts.mode === "none"
        ? "無効"
        : charSettings.tts.mode === "browser"
          ? "Browser Web Speech API"
          : `AquesTalk ${charSettings.tts.aquestalk.enabled ? "有効" : "無効"} / voice=${
              charSettings.tts.aquestalk.voice || "未設定"
            } / speed=${String(charSettings.tts.aquestalk.speed)}${
              charSettings.tts.aquestalk.rootDir ? ` / rootDir=${charSettings.tts.aquestalk.rootDir}` : ""
            }`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-gensou text-2xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Electron 版で利用するキャラクターごとの VRM / TTS / モーション設定を管理します。
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
          Touhou Talk 起動時の導線を設定します。
        </p>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">マップをスキップ</div>
            <div className="text-xs text-muted-foreground">
              有効にすると、チャット画面へ直接移動します。
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
          見た目のテーマを切り替えます。
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
          既定の会話スタイルを選びます。
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

      <Separator />

      <section className="rounded-2xl border bg-card/60 p-5">
        <h2 className="font-medium">キャラクター設定: VRM / TTS / モーション</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Electron 版で使うキャラクター表現の設定を編集します。
        </p>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-2">
            <div className="text-sm font-medium">キャラクター選択</div>
            <select
              className="w-full rounded-xl border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-ring"
              value={selectedChar}
              onChange={(e) => setSelectedChar(e.currentTarget.value)}
            >
              {CHARACTER_CATALOG.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.id})
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
              <div className="text-sm font-medium">このキャラクターの設定はまだ作成されていません</div>
              <div className="mt-1 text-xs text-muted-foreground">
                先に設定を初期化してから、VRM / TTS / モーションを登録してください。
              </div>
              <div className="mt-3">
                <Button type="button" disabled={charLoading} onClick={initCharSettings}>
                  設定を初期化
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
                    <div className="text-xs text-muted-foreground">
                      現在の状態:{" "}
                      {charSettings.vrm.enabled ? (
                        <>
                          有効 / <span className="font-mono">{charSettings.vrm.path ?? "avatar.vrm"}</span>
                        </>
                      ) : (
                        "無効"
                      )}
                      {charSettings.updatedAt ? <span className="ml-2 opacity-70">更新: {charSettings.updatedAt}</span> : null}
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
                  <div className="rounded-xl border bg-background/60 px-3 py-2">
                    <FileStatus
                      label="選択中"
                      value={pendingVrmFile ? { kind: "file", name: pendingVrmFile.name } : { kind: "none" }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={vrmInputRef}
                      type="file"
                      accept=".vrm"
                      className="hidden"
                      disabled={charLoading}
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0] ?? null;
                        setPendingVrmFile(f);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={charLoading}
                      onClick={() => vrmInputRef.current?.click()}
                    >
                      VRM を選択
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={charLoading || !pendingVrmFile}
                      onClick={() => {
                        setPendingVrmFile(null);
                        if (vrmInputRef.current) vrmInputRef.current.value = "";
                      }}
                    >
                      クリア
                    </Button>
                    <Button
                      type="button"
                      disabled={charLoading || !pendingVrmFile}
                      onClick={() => {
                        if (!pendingVrmFile) return;
                        void uploadVrm(pendingVrmFile);
                      }}
                    >
                      アップロード
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-background/40 px-4 py-4">
                <div className="text-sm font-medium">TTS</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  現在の状態: {ttsSummary}
                </div>

                <div className="mt-3 grid gap-3">
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
                      <option value="browser">Browser Web Speech API</option>
                      <option value="aquestalk">AquesTalk</option>
                    </select>
                  </div>

                  {charSettings.tts.mode === "aquestalk" ? (
                    <div className="grid gap-3">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!charSettings.tts.aquestalk.enabled}
                          onChange={(e) => {
                            const v = e.currentTarget.checked;
                            setCharSettings({
                              ...charSettings,
                              tts: { ...charSettings.tts, aquestalk: { ...charSettings.tts.aquestalk, enabled: v } },
                            });
                          }}
                          className="size-4"
                        />
                        AquesTalk を有効にする
                      </label>

                      <label className="grid gap-1 text-sm">
                        <span className="text-xs text-muted-foreground">AquesTalk フォルダ</span>
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
                          className="w-full rounded-xl border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-ring"
                        />
                      </label>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm">
                          <span className="text-xs text-muted-foreground">voice</span>
                          <input
                            type="text"
                            value={charSettings.tts.aquestalk.voice ?? ""}
                            placeholder="例: f1"
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
                            className="w-full rounded-xl border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-ring"
                          />
                        </label>

                        <label className="grid gap-1 text-sm">
                          <span className="text-xs text-muted-foreground">speed</span>
                          <input
                            type="number"
                            min={50}
                            max={300}
                            step={1}
                            value={Number.isFinite(charSettings.tts.aquestalk.speed) ? charSettings.tts.aquestalk.speed : 100}
                            onChange={(e) => {
                              const n = Number(e.currentTarget.value);
                              setCharSettings({
                                ...charSettings,
                                tts: {
                                  ...charSettings.tts,
                                  aquestalk: { ...charSettings.tts.aquestalk, speed: Number.isFinite(n) ? n : 100 },
                                },
                              });
                            }}
                            className="w-full rounded-xl border bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-ring"
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
                    <div className="text-xs text-muted-foreground">
                      現在の状態:{" "}
                      {charSettings.motions.enabled ? (
                        <>
                          有効 / <span className="font-mono">{charSettings.motions.indexPath ?? "motion-library/motions.json"}</span>
                        </>
                      ) : (
                        "無効"
                      )}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!charSettings.motions.enabled}
                      onChange={(e) => {
                        const v = e.currentTarget.checked;
                        setCharSettings({ ...charSettings, motions: { ...charSettings.motions, enabled: v } });
                      }}
                      className="size-4"
                    />
                    有効
                  </label>
                </div>

                <div className="mt-3 grid gap-3">
                  <div className="rounded-xl border bg-background/60 px-3 py-2">
                    <FileStatus
                      label="motions.json"
                      value={pendingMotionsJson ? { kind: "file", name: pendingMotionsJson.name } : { kind: "none" }}
                    />
                    <FileStatus
                      label="GLB"
                      value={
                        pendingMotionGlbs.length
                          ? { kind: "files", names: pendingMotionGlbs.map((f) => f.name) }
                          : { kind: "none" }
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={motionsJsonRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        disabled={charLoading}
                        onChange={(e) => {
                          const f = e.currentTarget.files?.[0] ?? null;
                          setPendingMotionsJson(f);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={charLoading}
                        onClick={() => motionsJsonRef.current?.click()}
                      >
                        motions.json を選択
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={charLoading || !pendingMotionsJson}
                        onClick={() => {
                          setPendingMotionsJson(null);
                          if (motionsJsonRef.current) motionsJsonRef.current.value = "";
                        }}
                      >
                        クリア
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={motionsGlbsRef}
                        type="file"
                        accept=".glb,model/gltf-binary"
                        className="hidden"
                        multiple
                        disabled={charLoading}
                        onChange={(e) => {
                          const files = Array.from(e.currentTarget.files ?? []);
                          setPendingMotionGlbs(files);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={charLoading}
                        onClick={() => motionsGlbsRef.current?.click()}
                      >
                        GLB を選択
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={charLoading || pendingMotionGlbs.length === 0}
                        onClick={() => {
                          setPendingMotionGlbs([]);
                          if (motionsGlbsRef.current) motionsGlbsRef.current.value = "";
                        }}
                      >
                        クリア
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      motions.json がなくても、GLB だけで既存ライブラリへ追加できる場合があります。
                    </div>
                    <Button
                      type="button"
                      disabled={charLoading || (!pendingMotionsJson && pendingMotionGlbs.length === 0)}
                      onClick={() => void uploadMotions(pendingMotionsJson, pendingMotionGlbs)}
                    >
                      アップロード
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={charLoading}
                  onClick={() => void loadCharSettings(selectedChar)}
                >
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
