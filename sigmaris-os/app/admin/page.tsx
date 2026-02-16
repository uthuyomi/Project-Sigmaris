"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Metrics = {
  generatedAt: string;
  adminEmail: string;
  authUsersTotal: number | null;
  apps: Record<
    "sigmaris" | "touhou",
    {
      messagesTotal: number;
      sessionsTotal: number;
      activeUsers7d: number;
      activeUsers24h: number;
      messages7d: number;
      messages24h: number;
    }
  >;
  hourlyJst: {
    combined: number[];
    sigmaris: number[];
    touhou: number[];
  };
};

function hourLabel(h: number) {
  return String(h).padStart(2, "0");
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/metrics", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as Metrics;
        if (!cancelled) setMetrics(json);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setError(msg || "Failed to load metrics");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = React.useMemo(() => {
    if (!metrics) return [];
    return Array.from({ length: 24 }, (_, h) => ({
      hour: hourLabel(h),
      combined: metrics.hourlyJst.combined[h] ?? 0,
      sigmaris: metrics.hourlyJst.sigmaris[h] ?? 0,
      touhou: metrics.hourlyJst.touhou[h] ?? 0,
    }));
  }, [metrics]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0e141b] to-[#1a2230] text-[#e6eef4] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-white/70">
          Metrics derived from Supabase tables (common_messages/common_sessions).
        </p>

        {error && (
          <div className="mt-6 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!metrics && !error && (
          <div className="mt-6 text-sm text-white/70">Loading…</div>
        )}

        {metrics && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/60">Auth users (total)</div>
                <div className="mt-1 text-2xl font-semibold">
                  {metrics.authUsersTotal ?? "—"}
                </div>
                <div className="mt-1 text-[11px] text-white/50">
                  Generated: {new Date(metrics.generatedAt).toLocaleString()}
                </div>
              </div>

              {(["sigmaris", "touhou"] as const).map((app) => (
                <div
                  key={app}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="text-xs text-white/60">{app}</div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[11px] text-white/50">Active (24h)</div>
                      <div className="font-semibold">
                        {metrics.apps[app].activeUsers24h}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-white/50">Active (7d)</div>
                      <div className="font-semibold">
                        {metrics.apps[app].activeUsers7d}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-white/50">Msgs (24h)</div>
                      <div className="font-semibold">
                        {metrics.apps[app].messages24h}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-white/50">Msgs (total)</div>
                      <div className="font-semibold">
                        {metrics.apps[app].messagesTotal}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold">Usage by hour (JST, last 7 days)</div>
              <div className="mt-4 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="hour" stroke="rgba(255,255,255,0.6)" />
                    <YAxis stroke="rgba(255,255,255,0.6)" />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(10, 15, 25, 0.95)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "#e6eef4",
                      }}
                    />
                    <Bar dataKey="combined" fill="#4c7cf7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-[11px] text-white/50">
                Combined messages/hour across both apps.
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

