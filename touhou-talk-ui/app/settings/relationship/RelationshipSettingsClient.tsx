"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CHARACTERS } from "@/data/characters";

type RelationshipRow = {
  characterId: string;
  scopeKey: string;
  trust: number;
  familiarity: number;
  lastUpdated: string | null;
};

type MemoryRow = {
  scopeKey: string;
  topics: string[];
  emotions: string[];
  recurringIssues: string[];
  traits: string[];
  updatedAt: string | null;
} | null;

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampTrust(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function trustLabel(t: number) {
  if (t <= -0.6) return "不信（強）";
  if (t <= -0.2) return "不信";
  if (t < 0.2) return "中立";
  if (t < 0.6) return "信頼";
  return "信頼（強）";
}

function familiarityLabel(f: number) {
  if (f < 0.25) return "低";
  if (f < 0.6) return "中";
  return "高";
}

function Meter(props: { label: string; value: number; min: number; max: number }) {
  const v = Math.max(props.min, Math.min(props.max, props.value));
  const pct = ((v - props.min) / (props.max - props.min)) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="text-muted-foreground">{props.label}</div>
        <div className="font-mono">{v.toFixed(3)}</div>
      </div>
      <div className="h-2 w-full rounded-full bg-border/50">
        <div className="h-2 rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RelationshipSettingsClient() {
  const characterOptions = useMemo(() => Object.values(CHARACTERS), []);
  const [selectedChar, setSelectedChar] = useState<string>(() => characterOptions[0]?.id ?? "reimu");

  const [relationships, setRelationships] = useState<RelationshipRow[]>([]);
  const [memory, setMemory] = useState<MemoryRow>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const importRef = useRef<HTMLInputElement | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/relationship", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as any;
      if (!r.ok) throw new Error(j?.error || "fetch failed");
      setRelationships(Array.isArray(j?.relationships) ? (j.relationships as RelationshipRow[]) : []);
      setMemory(j?.memory ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e ?? ""));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const activeRel = useMemo(() => {
    const row = relationships.find((r) => r.characterId === selectedChar) ?? null;
    return row
      ? {
          ...row,
          trust: clampTrust(row.trust),
          familiarity: clamp01(row.familiarity),
        }
      : null;
  }, [relationships, selectedChar]);

  const doReset = async (kind: "all" | "character" | "memory") => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const body =
        kind === "all"
          ? { resetRelationships: true, resetMemory: true }
          : kind === "memory"
            ? { resetRelationships: false, resetMemory: true }
            : { characterId: selectedChar, resetRelationships: true, resetMemory: false };

      const r = await fetch("/api/relationship/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => null)) as any;
      if (!r.ok) throw new Error(j?.error || "reset failed");
      setInfo("リセットしました。");
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e ?? ""));
    } finally {
      setLoading(false);
    }
  };

  const doExport = async () => {
    setError(null);
    setInfo(null);
    try {
      const r = await fetch("/api/relationship/export", { cache: "no-store" });
      if (!r.ok) throw new Error("export failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "touhou-talk-relationship-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setInfo("エクスポートしました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e ?? ""));
    }
  };

  const doImport = async (file: File) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const r = await fetch("/api/relationship/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const j = (await r.json().catch(() => null)) as any;
      if (!r.ok) throw new Error(j?.error || "import failed");
      setInfo("インポートしました。");
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e ?? ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-gensou text-2xl">関係性・記憶の管理</h1>
          <p className="text-muted-foreground text-sm">
            Relationship（trust/familiarity）と、会話から抽出した Memory を確認・リセット・輸出入できます。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/chat/session">チャットへ</Link>
        </Button>
      </div>

      <Separator />

      <section className="rounded-2xl border bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">キャラ</div>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={selectedChar}
              onChange={(e) => setSelectedChar(e.currentTarget.value)}
              disabled={loading}
            >
              {characterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.id}）
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={doExport} disabled={loading}>
              エクスポート
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                importRef.current?.click();
              }}
              disabled={loading}
            >
              インポート
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0] ?? null;
                e.currentTarget.value = "";
                if (f) void doImport(f);
              }}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Relationship</div>
              {activeRel ? (
                <div className="text-xs text-muted-foreground">
                  trust={trustLabel(activeRel.trust)}, familiarity={familiarityLabel(activeRel.familiarity)}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">未作成（0扱い）</div>
              )}
            </div>

            <div className="mt-3 space-y-3">
              <Meter label="trust (-1..1)" value={activeRel?.trust ?? 0} min={-1} max={1} />
              <Meter label="familiarity (0..1)" value={activeRel?.familiarity ?? 0} min={0} max={1} />
              <div className="text-xs text-muted-foreground">
                更新日時: {activeRel?.lastUpdated ?? "—"}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="destructive" onClick={() => void doReset("character")} disabled={loading}>
                このキャラをリセット
              </Button>
              <Button variant="outline" onClick={() => void doReset("all")} disabled={loading}>
                全部リセット
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Memory</div>
              <div className="text-xs text-muted-foreground">更新日時: {memory?.updatedAt ?? "—"}</div>
            </div>

            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">topics</div>
                <div className="font-mono text-xs">{memory?.topics?.join(", ") || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">emotions</div>
                <div className="font-mono text-xs">{memory?.emotions?.join(", ") || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">recurring issues</div>
                <div className="font-mono text-xs">{memory?.recurringIssues?.join(", ") || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">traits</div>
                <div className="font-mono text-xs">{memory?.traits?.join(", ") || "—"}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="destructive" onClick={() => void doReset("memory")} disabled={loading}>
                Memoryをリセット
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs">
          {loading ? <span className="text-muted-foreground">処理中…</span> : null}
          {info ? <span className="text-foreground/80">{info}</span> : null}
          {error ? <span className="text-red-400">{error}</span> : null}
        </div>
      </section>
    </div>
  );
}

