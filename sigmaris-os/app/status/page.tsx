"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { SigmarisLangProvider } from "@/lib/sigmarisLangContext";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Snapshot = {
  id: number;
  session_id: string | null;
  trace_id: string | null;
  global_state: string | null;
  overload_score: number | null;
  reflective_score: number | null;
  memory_pointer_count: number | null;
  safety_flag: string | null;
  safety_risk_score: number | null;
  value_state: any | null;
  trait_state: any | null;
  created_at: string;
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function num(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export default function StatusPage() {
  return (
    <SigmarisLangProvider>
      <StatusContent />
    </SigmarisLangProvider>
  );
}

function StatusContent() {
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [series, setSeries] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([
          fetch("/api/state/latest", { credentials: "include" }).then((r) =>
            r.json()
          ),
          fetch("/api/state/timeseries?limit=60", {
            credentials: "include",
          }).then((r) => r.json()),
        ]);
        setLatest(a?.snapshot ?? null);
        setSeries(b?.snapshots ?? []);
      } catch (e) {
        console.error("status load failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const chartData = useMemo(() => {
    return (series ?? []).map((s) => {
      const traits = s.trait_state ?? {};
      return {
        t: fmtTime(s.created_at),
        calm: num(traits.calm) ?? null,
        empathy: num(traits.empathy) ?? null,
        curiosity: num(traits.curiosity) ?? null,
        overload: num(s.overload_score) ?? null,
        risk: num(s.safety_risk_score) ?? null,
        memory: typeof s.memory_pointer_count === "number" ? s.memory_pointer_count : null,
      };
    });
  }, [series]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 md:px-16 py-24">
      <Header />

      <div className="max-w-6xl mx-auto mt-16 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-[#4c7cf7]">
            Sigmaris 状態ダッシュボード
          </h1>
          <p className="text-sm text-[#b9c4d2] mt-2">
            現在の「人格OSの内部状態」を数値化して表示します（traits / safety /
            memory / state）。
          </p>
        </div>

        {loading ? (
          <div className="text-[#b9c4d2]">Loading...</div>
        ) : !latest ? (
          <div className="text-[#b9c4d2]">
            まだ状態データがありません。チャットを1回送ると生成されます。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Global State" value={latest.global_state ?? "—"} sub={latest.created_at} />
            <Card
              title="Overload"
              value={
                typeof latest.overload_score === "number"
                  ? latest.overload_score.toFixed(3)
                  : "—"
              }
              sub="overload_score"
            />
            <Card
              title="Safety Risk"
              value={
                typeof latest.safety_risk_score === "number"
                  ? latest.safety_risk_score.toFixed(3)
                  : "0.000"
              }
              sub={latest.safety_flag ? `flag: ${latest.safety_flag}` : "flag: none"}
            />
            <Card
              title="Memory Pointers"
              value={
                typeof latest.memory_pointer_count === "number"
                  ? String(latest.memory_pointer_count)
                  : "—"
              }
              sub="selected pointers"
            />
            <Card
              title="Traits (calm)"
              value={
                typeof latest.trait_state?.calm === "number"
                  ? latest.trait_state.calm.toFixed(3)
                  : "—"
              }
              sub="trait_state.calm"
            />
            <Card
              title="Traits (empathy)"
              value={
                typeof latest.trait_state?.empathy === "number"
                  ? latest.trait_state.empathy.toFixed(3)
                  : "—"
              }
              sub="trait_state.empathy"
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Traits (time series)">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="t" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1220",
                      border: "1px solid rgba(76,124,247,0.25)",
                      color: "#e6eef4",
                    }}
                  />
                  <Line type="monotone" dataKey="calm" stroke="#60a5fa" dot={false} />
                  <Line type="monotone" dataKey="empathy" stroke="#f59e0b" dot={false} />
                  <Line type="monotone" dataKey="curiosity" stroke="#34d399" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Load / Safety / Memory (time series)">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="t" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0b1220",
                      border: "1px solid rgba(76,124,247,0.25)",
                      color: "#e6eef4",
                    }}
                  />
                  <Line type="monotone" dataKey="overload" stroke="#a78bfa" dot={false} />
                  <Line type="monotone" dataKey="risk" stroke="#fb7185" dot={false} />
                  <Line type="monotone" dataKey="memory" stroke="#22c55e" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="border border-[#4c7cf7]/25 rounded-2xl p-5 bg-[#141c26]/40 backdrop-blur-md">
      <div className="text-xs text-[#b9c4d2]">{title}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      {sub && <div className="text-xs text-[#94a3b8] mt-2 break-words">{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#4c7cf7]/25 rounded-2xl p-5 bg-[#141c26]/40 backdrop-blur-md">
      <div className="text-sm font-semibold text-[#e6eef4] mb-3">{title}</div>
      {children}
    </div>
  );
}
